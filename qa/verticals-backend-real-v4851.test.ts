import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import { signAccessToken } from '../backend/src/shared/auth/jwt.ts';

const RUN=`V48-${Date.now().toString(36).toUpperCase()}`;

test('48/51 real PostgreSQL: dentistry + veterinary + gym lifecycle, isolation, permissions, restart persistence and cleanup',async(t)=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production','48/51 must never run against production');

  let harness=await createRealBackendHarness();
  let restrictedUserId='';
  let foreignTenantId='';
  let dentalPatientId='';
  let dentalEncounterId='';
  let amendedDentalEncounterId='';
  let petId='';
  let hospitalizationId='';
  let gymMemberId='';
  let gymAssessmentId='';

  t.after(async()=>{
    await harness.close().catch(()=>undefined);

    if(gymMemberId){
      await harness.prisma.$executeRawUnsafe('DELETE FROM public."GymAssessment" WHERE "memberId"=$1',gymMemberId).catch(()=>undefined);
      await harness.prisma.$executeRawUnsafe('DELETE FROM public."GymMember" WHERE "id"=$1',gymMemberId).catch(()=>undefined);
    }
    if(hospitalizationId)await harness.prisma.$executeRawUnsafe('DELETE FROM public."CareHospitalization" WHERE "id"=$1',hospitalizationId).catch(()=>undefined);
    if(amendedDentalEncounterId)await harness.prisma.$executeRawUnsafe('DELETE FROM public."CareEncounter" WHERE "id"=$1',amendedDentalEncounterId).catch(()=>undefined);
    if(dentalEncounterId)await harness.prisma.$executeRawUnsafe('DELETE FROM public."CareEncounter" WHERE "id"=$1',dentalEncounterId).catch(()=>undefined);
    if(petId)await harness.prisma.$executeRawUnsafe('DELETE FROM public."CarePatient" WHERE "id"=$1',petId).catch(()=>undefined);
    if(dentalPatientId)await harness.prisma.$executeRawUnsafe('DELETE FROM public."CarePatient" WHERE "id"=$1',dentalPatientId).catch(()=>undefined);
    if(restrictedUserId)await harness.prisma.userProfile.deleteMany({where:{id:restrictedUserId}}).catch(()=>undefined);
    if(foreignTenantId)await harness.prisma.tenant.deleteMany({where:{id:foreignTenantId}}).catch(()=>undefined);
  });

  await t.test('permission denial is real and does not self-escalate',async()=>{
    const restricted=await harness.prisma.userProfile.create({
      data:{
        tenantId:harness.tenant.id,
        email:`${RUN.toLowerCase()}.restricted@qa.local`,
        fullName:'QA 48 Restricted',
        passwordHash:'qa-only-not-a-login-secret',
        status:'active'
      }
    });
    restrictedUserId=restricted.id;
    const restrictedToken=signAccessToken({id:restricted.id,email:restricted.email},harness.tenant.id);

    await harness.status('/verticals/health/patients?kind=human',403,{},restrictedToken);
    await harness.status('/verticals/veterinary/hospitalizations',403,{},restrictedToken);
    await harness.status('/verticals/gym/members',403,{},restrictedToken);
  });

  await t.test('prepare foreign-tenant fixtures used only to prove isolation',async()=>{
    const foreign=await harness.prisma.tenant.create({
      data:{
        rif:`QA-${RUN}`,
        name:`${RUN} Foreign`,
        legalName:`${RUN} Foreign C.A.`,
        plan:'qa',
        status:'active',
        settings:{}
      }
    });
    foreignTenantId=foreign.id;

    const foreignPatientId=randomUUID();
    await harness.prisma.$executeRawUnsafe(`
      INSERT INTO public."CarePatient"
        ("id","tenantId","kind","displayName","active","emergencyContact","createdAt","updatedAt")
      VALUES ($1,$2,'human',$3,true,'{}'::jsonb,now(),now())
    `,foreignPatientId,foreignTenantId,`${RUN} Foreign Patient`);

    const foreignPetId=randomUUID();
    await harness.prisma.$executeRawUnsafe(`
      INSERT INTO public."CarePatient"
        ("id","tenantId","kind","displayName","species","active","emergencyContact","createdAt","updatedAt")
      VALUES ($1,$2,'animal',$3,'canine',true,'{}'::jsonb,now(),now())
    `,foreignPetId,foreignTenantId,`${RUN} Foreign Pet`);

    const foreignMemberId=randomUUID();
    await harness.prisma.$executeRawUnsafe(`
      INSERT INTO public."GymMember"
        ("id","tenantId","memberCode","fullName","emergencyContact","goals","status","joinedAt","createdAt","updatedAt")
      VALUES ($1,$2,$3,$4,'{}'::jsonb,'[]'::jsonb,'active',now(),now(),now())
    `,foreignMemberId,foreignTenantId,`${RUN}-FOREIGN`,`${RUN} Foreign Member`);

    await harness.status('/verticals/health/encounters',422,{
      method:'POST',
      body:JSON.stringify({
        patientId:foreignPatientId,
        specialty:'dentistry',
        type:'dental-treatment',
        subjective:'foreign',
        objective:'foreign',
        assessment:'foreign',
        plan:'foreign',
        diagnosisCodes:[],
        clinicalData:{tooth:'11',procedure:'Evaluación',odontogram:{dentition:'permanent',tooth:'11',surfaces:['vestibular'],condition:'foreign'}},
        confidential:false,
        status:'signed'
      })
    });

    await harness.status('/verticals/veterinary/hospitalizations',404,{
      method:'POST',
      body:JSON.stringify({patientId:foreignPetId,reason:'Cross tenant must fail',status:'admitted',carePlan:{}})
    });

    await harness.status('/verticals/gym/assessments',422,{
      method:'POST',
      body:JSON.stringify({memberId:foreignMemberId,weightKg:70,heightCm:170,notes:'Cross tenant must fail'})
    });
  });

  await t.test('dentistry create → read → amendment preserves old version',async()=>{
    const patient=await harness.ok('/verticals/health/patients',{
      method:'POST',
      body:JSON.stringify({
        kind:'human',
        displayName:`${RUN} Dental Patient`,
        firstName:'QA',
        lastName:'Dental',
        email:`${RUN.toLowerCase()}@qa.local`,
        emergencyContact:{},
        active:true
      })
    });
    dentalPatientId=String(patient.id);
    assert.ok(dentalPatientId);

    const created=await harness.ok('/verticals/health/encounters',{
      method:'POST',
      body:JSON.stringify({
        patientId:dentalPatientId,
        specialty:'dentistry',
        type:'dental-treatment',
        subjective:'Lesión inicial',
        objective:'Pieza 11',
        assessment:'Caries inicial',
        plan:'Restauración',
        diagnosisCodes:[],
        clinicalData:{
          tooth:'11',
          procedure:'Restauración',
          odontogram:{dentition:'permanent',tooth:'11',surfaces:['vestibular'],condition:'caries'}
        },
        confidential:false,
        status:'signed'
      })
    });
    dentalEncounterId=String(created.id);
    assert.equal(created.status,'signed');

    const before=await harness.ok(`/verticals/health/encounters?patientId=${encodeURIComponent(dentalPatientId)}`);
    assert.ok(before.some((row:any)=>String(row.id)===dentalEncounterId));

    const amended=await harness.ok(`/verticals/health/encounters/${encodeURIComponent(dentalEncounterId)}/amend`,{
      method:'POST',
      body:JSON.stringify({
        reason:'Control clínico QA 48',
        professionalId:null,
        subjective:'Lesión controlada',
        assessment:'Restauración indicada',
        plan:'Seguimiento',
        clinicalData:{
          tooth:'11',
          procedure:'Restauración',
          odontogram:{dentition:'permanent',tooth:'11',surfaces:['vestibular','mesial'],condition:'restored'}
        }
      })
    });
    amendedDentalEncounterId=String(amended.id);
    assert.notEqual(amendedDentalEncounterId,dentalEncounterId);
    assert.equal(amended.status,'signed');
    assert.equal(amended.clinicalData?.versioning?.previousEncounterId,dentalEncounterId);

    const oldRows=await harness.prisma.$queryRawUnsafe<any[]>('SELECT "status","clinicalData" FROM public."CareEncounter" WHERE "tenantId"=$1 AND "id"=$2',harness.tenant.id,dentalEncounterId);
    assert.equal(oldRows[0]?.status,'amended');
    assert.equal(oldRows[0]?.clinicalData?.odontogram?.condition,'caries');
  });

  await t.test('veterinary create pet → hospitalization → status transition → read',async()=>{
    const pet=await harness.ok('/verticals/health/patients',{
      method:'POST',
      body:JSON.stringify({
        kind:'animal',
        displayName:`${RUN} Pet`,
        species:'canine',
        breed:'mixed',
        guardianName:'QA Guardian',
        guardianPhone:'000-000',
        emergencyContact:{},
        active:true
      })
    });
    petId=String(pet.id);

    const hospitalization=await harness.ok('/verticals/veterinary/hospitalizations',{
      method:'POST',
      body:JSON.stringify({
        patientId:petId,
        reason:'Observación QA 48',
        diagnosis:'estable',
        status:'admitted',
        carePlan:{qa:true}
      })
    });
    hospitalizationId=String(hospitalization.id);
    assert.equal(hospitalization.status,'admitted');

    const updated=await harness.ok(`/verticals/veterinary/hospitalizations/${encodeURIComponent(hospitalizationId)}/status`,{
      method:'PATCH',
      body:JSON.stringify({status:'observed',diagnosis:'observación controlada'})
    });
    assert.equal(updated.status,'observed');

    const rows=await harness.ok(`/verticals/veterinary/hospitalizations?patientId=${encodeURIComponent(petId)}`);
    assert.ok(rows.some((row:any)=>String(row.id)===hospitalizationId&&row.status==='observed'));
  });

  await t.test('gym create member → assessment evolution → read',async()=>{
    const member=await harness.ok('/verticals/gym/members',{
      method:'POST',
      body:JSON.stringify({
        memberCode:`${RUN}-M1`,
        fullName:`${RUN} Gym Member`,
        email:`${RUN.toLowerCase()}.gym@qa.local`,
        emergencyContact:{},
        goals:['strength'],
        medicalNotes:'',
        status:'active'
      })
    });
    gymMemberId=String(member.id);

    const assessment=await harness.ok('/verticals/gym/assessments',{
      method:'POST',
      body:JSON.stringify({
        memberId:gymMemberId,
        trainerId:null,
        weightKg:80,
        heightCm:180,
        bodyFatPct:20,
        muscleMassKg:60,
        notes:'QA 48 baseline'
      })
    });
    gymAssessmentId=String(assessment.id);
    assert.equal(Number(assessment.bmi),24.69);

    const members=await harness.ok(`/verticals/gym/members?q=${encodeURIComponent(RUN)}`);
    assert.ok(members.some((row:any)=>String(row.id)===gymMemberId));

    const assessments=await harness.ok(`/verticals/gym/assessments?memberId=${encodeURIComponent(gymMemberId)}`);
    assert.ok(assessments.some((row:any)=>String(row.id)===gymAssessmentId&&Number(row.weightKg)===80));
  });

  await t.test('server restart proves data persistence instead of in-memory state',async()=>{
    await harness.close();
    harness=await createRealBackendHarness();

    const dental=await harness.ok(`/verticals/health/encounters?patientId=${encodeURIComponent(dentalPatientId)}`);
    assert.ok(dental.some((row:any)=>String(row.id)===amendedDentalEncounterId&&row.status==='signed'));

    const vet=await harness.ok(`/verticals/veterinary/hospitalizations?patientId=${encodeURIComponent(petId)}`);
    assert.ok(vet.some((row:any)=>String(row.id)===hospitalizationId&&row.status==='observed'));

    const gym=await harness.ok(`/verticals/gym/assessments?memberId=${encodeURIComponent(gymMemberId)}`);
    assert.ok(gym.some((row:any)=>String(row.id)===gymAssessmentId));
  });

  await t.test('error paths reject malformed or missing relations',async()=>{
    await harness.status('/verticals/health/patients',422,{method:'POST',body:JSON.stringify({kind:'human',displayName:''})});
    await harness.status('/verticals/veterinary/hospitalizations',404,{method:'POST',body:JSON.stringify({patientId:randomUUID(),reason:'Missing pet',status:'admitted',carePlan:{}})});
    await harness.status('/verticals/gym/assessments',422,{method:'POST',body:JSON.stringify({memberId:randomUUID(),weightKg:70})});
  });
});
