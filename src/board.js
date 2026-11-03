/** The field is eight cells wide so that a full row contains eight cells. */
export const BOARD_COLUMNS = 8;
export const BOARD_ROWS = 10;

/** Create independent rows so the field can later hold block references. */
export function createEmptyBoard() {
  return Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLUMNS).fill(null));
}
