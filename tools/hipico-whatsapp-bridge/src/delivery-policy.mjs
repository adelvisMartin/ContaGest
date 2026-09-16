export function shouldSendLabSimulation(event, result) {
  return event?.channelRole === 'source'
    && event?.historySync !== true
    && result?.duplicate !== true;
}
