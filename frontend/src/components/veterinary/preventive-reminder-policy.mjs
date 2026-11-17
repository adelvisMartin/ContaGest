/**
 * An optional reminder cannot roll back an already-committed preventive record.
 * Never leak the provider response or retry scheduling automatically.
 */
export async function scheduleOptionalPreventiveReminder(schedule,event){
  try{
    return {reminder:(await schedule(event))||null,reminderNotConfirmed:false};
  }catch{
    return {reminder:null,reminderNotConfirmed:true};
  }
}
