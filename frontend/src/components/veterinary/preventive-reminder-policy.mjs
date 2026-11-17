/**
 * An optional reminder cannot roll back an already-committed preventive record.
 * Never leak the provider response or retry scheduling automatically.
 */
export async function scheduleOptionalPreventiveReminder(schedule,event,requireAck=false){
  try{
    const reminder=(await schedule(event))||null;
    if(requireAck&&(!reminder||typeof reminder.id!=='string'||!reminder.id.trim())){
      return {reminder:null,reminderNotConfirmed:true};
    }
    return {reminder,reminderNotConfirmed:false};
  }catch{
    return {reminder:null,reminderNotConfirmed:true};
  }
}
