import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_COLUMNS, BOARD_ROWS, createEmptyBoard } from '../src/board.js';

test('creates an empty field with ten independent rows of eight cells', () => {
  const board = createEmptyBoard();
  assert.equal(BOARD_ROWS, 10);
  assert.equal(BOARD_COLUMNS, 8);
  assert.equal(board.length, 10);
  assert.ok(board.every(row => row.length === 8 && row.every(cell => cell === null)));
  board[0][0] = 'block';
  assert.equal(board[1][0], null);
  assert.equal(createEmptyBoard()[0][0], null);
});
