import {Router} from 'express';
import {prisma} from '../../database/prisma.js';
import {asyncHandler,HttpError,ok} from '../../shared/http.js';
import {requirePermission} from '../../shared/middleware/context.js';
import {ctx} from './verticals.shared.js';
import {dentalClinicalDataSchema,periodontalClinicalDataSchema,dentalChartHistoryQuerySchema} from './health.schemas.js';

const router=Router();

type ChartRow={
  id:string;type:string;status:string;professionalId:string|null;
  signedAt:Date|null;clinicalData:any;
};

router.get('/health/dental/chart-history',requirePermission('health.manage'),asyncHandler(async(req,res)=>{
  const parsed=dentalChartHistoryQuerySchema.safeParse(req.query);
  if(!parsed.success)throw new HttpError(422,'Filtro de historia odontológica inválido.');
  const tenantId=ctx(req).tenantId, patientId=parsed.data.patientId;
  const patient=await prisma.$queryRawUnsafe<Array<{id:string;kind:string}>>(
    'SELECT "id","kind" FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',
    tenantId,patientId
  );
  if(!patient.length||patient[0].kind!=='human')
    throw new HttpError(404,'Paciente odontológico no encontrado.');

  // CareEncounter remains the only clinical authority. Do not backfill from
  // ambiguous draft blobs or update/replace signed encounter evidence.
  const records=await prisma.$queryRawUnsafe<ChartRow[]>(`
    SELECT "id","type","status","professionalId","signedAt","clinicalData"
    FROM public."CareEncounter"
    WHERE "tenantId"=$1 AND "patientId"=$2
      AND "type" IN ('dental-treatment','periodontal-chart')
      AND "status" IN ('signed','amended')
    ORDER BY "signedAt" ASC NULLS LAST,"id" ASC
    LIMIT 501
  `,tenantId,patientId);
  if(records.length>500)
    throw new HttpError(409,'El historial supera el límite de reconstrucción; utiliza una consulta histórica paginada.');

  const history:any[]=[],unprojectable:any[]=[];
  for(const record of records){
    if(!record.signedAt){
      unprojectable.push({encounterId:record.id,code:'MISSING_SIGNATURE_DATE'});
      continue;
    }
    const parsed=record.type==='dental-treatment'
      ?dentalClinicalDataSchema.safeParse(record.clinicalData||{})
      :periodontalClinicalDataSchema.safeParse(record.clinicalData||{});
    if(!parsed.success){
      unprojectable.push({encounterId:record.id,code:'LEGACY_CHART_NOT_PROJECTABLE'});
      continue;
    }
    const data:any=parsed.data;
    const chart=record.type==='dental-treatment'?data.odontogram:data.periodontogram;
    const details={
      encounterId:record.id,rootEncounterId:String(data.versioning?.rootEncounterId||record.id),
      previousEncounterId:data.versioning?.previousEncounterId||null,
      professionalId:record.professionalId,status:record.status,
      signedAt:new Date(record.signedAt).toISOString(),
      kind:record.type==='dental-treatment'?'surface':'periodontal',
      dentition:chart.dentition,tooth:chart.tooth
    };
    if(record.type==='dental-treatment'){
      for(const surface of chart.surfaces){
        history.push({...details,surface,condition:chart.condition});
      }
    }else{
      for(const site of chart.sites){
        history.push({...details,site:site.site,probingDepthMm:site.probingDepthMm,
          gingivalMarginMm:site.gingivalMarginMm,bleeding:site.bleeding,
          suppuration:site.suppuration,plaque:site.plaque,
          mobilityGrade:chart.mobilityGrade,furcationGrade:chart.furcationGrade});
      }
    }
  }
  // An old amended encounter is historical only. A newly signed amendment
  // replaces its source surfaces; never treat a superseded state as current.
  // Any invalid historical chart blocks claims of a complete current state.
  const current=new Map<string,any>();
  if(!unprojectable.length){
    for(const entry of history){
      if(entry.status!=='signed')continue;
      const key=[entry.kind,entry.dentition,entry.tooth,entry.surface||entry.site].join(':');
      current.set(key,entry);
    }
  }
  ok(res,{
    patientId,sourceAuthority:'CareEncounter.signed',
    complete:unprojectable.length===0,
    current:[...current.values()].sort((a,b)=>a.tooth.localeCompare(b.tooth)
      ||String(a.surface||a.site).localeCompare(String(b.surface||b.site))),
    history,unprojectable
  });
}));

export default router;
