/*
  Production must never ship the prototype fixtures. Product views use live
  clients in production; these empty exports make an accidentally selected
  prototype branch fail empty instead of displaying invented account data.
*/
export const strategies = [];
export const bots = [];
export const leaderboard = [];
export const notifications = [];
