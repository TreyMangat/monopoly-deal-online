// ============================================================
// MONOPOLY DEAL ONLINE — Game Constants
// ============================================================

import { PropertyColor } from "./types";

// How many property cards complete a set for each color
export const SET_SIZE: Record<PropertyColor, number> = {
  [PropertyColor.Brown]: 2,
  [PropertyColor.LightBlue]: 3,
  [PropertyColor.Pink]: 3,
  [PropertyColor.Orange]: 3,
  [PropertyColor.Red]: 3,
  [PropertyColor.Yellow]: 3,
  [PropertyColor.Green]: 3,
  [PropertyColor.DarkBlue]: 2,
  [PropertyColor.Railroad]: 4,
  [PropertyColor.Utility]: 2,
};

// Rent values by number of cards in the color group
// Index 0 = 1 card, index 1 = 2 cards, etc.
export const RENT_VALUES: Record<PropertyColor, number[]> = {
  [PropertyColor.Brown]: [1, 2],
  [PropertyColor.LightBlue]: [1, 2, 3],
  [PropertyColor.Pink]: [1, 2, 4],
  [PropertyColor.Orange]: [1, 3, 5],
  [PropertyColor.Red]: [2, 3, 6],
  [PropertyColor.Yellow]: [2, 4, 6],
  [PropertyColor.Green]: [2, 4, 7],
  [PropertyColor.DarkBlue]: [3, 8],
  [PropertyColor.Railroad]: [1, 2, 3, 4],
  [PropertyColor.Utility]: [1, 2],
};

// House adds 3M to rent, Hotel adds 4M to rent
export const HOUSE_RENT_BONUS = 3;
export const HOTEL_RENT_BONUS = 4;

// Turn rules
export const CARDS_TO_DRAW = 2;
export const CARDS_TO_DRAW_EMPTY_HAND = 5;
export const MAX_PLAYS_PER_TURN = 3;
export const MAX_HAND_SIZE = 7;

// Win condition
export const SETS_TO_WIN = 3;

// Deck size
export const SINGLE_DECK_SIZE = 106; // 110 minus 4 quick start rule cards
export const DOUBLE_DECK_SIZE = 212;

// Room settings
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const DOUBLE_DECK_THRESHOLD = 6; // use double deck at this player count
export const ROOM_CODE_LENGTH = 6;
export const ROOM_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity
export const RECONNECT_GRACE_MS = 180 * 1000; // 3 minutes to reconnect (matches client 5min window)
export const PING_INTERVAL_MS = 25 * 1000; // 25s — under Render's ~30s proxy timeout

// Turn timers
export const TURN_TIMER_MS = 60 * 1000; // 60 seconds to take your turn
export const RESPONSE_TIMER_MS = 30 * 1000; // 30 seconds to respond to an action
export const DISCONNECTED_RESPONSE_TIMER_MS = 10 * 1000; // 10 seconds if targeted player is disconnected
export const TIMER_UPDATE_INTERVAL_MS = 5 * 1000; // send countdown every 5 seconds

// Action card values (what they charge)
export const DEBT_COLLECTOR_AMOUNT = 5;
export const BIRTHDAY_AMOUNT = 2;

// Money card denominations and counts (per deck)
export const MONEY_CARDS = [
  { value: 1, count: 6 },
  { value: 2, count: 5 },
  { value: 3, count: 3 },
  { value: 4, count: 3 },
  { value: 5, count: 2 },
  { value: 10, count: 1 },
];
