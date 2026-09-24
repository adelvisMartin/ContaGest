import { MediaService } from './mediaService.js';

export const query=(params={})=>{
  const value=new URLSearchParams(
    Object.entries(params).filter(([,item])=>item!==undefined&&item!==null&&item!=='')
  ).toString();
  return value?`?${value}`:'';
};

export const pathId=(value)=>encodeURIComponent(String(value??''));

export async function createWithPhoto(create,payload,entityType,altField){
  const {photoDataUrl='',...data}=payload||{};
  const record=await create(data);
  if(!photoDataUrl)return record;
  const media=await MediaService.upload({
    entityType,
    entityId:record.id,
    dataUrl:photoDataUrl,
    alt:record?.[altField]||''
  });
  return {...record,photoPath:media.path,photoUrl:media.signedUrl};
}
