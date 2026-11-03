import { createEmptyBoard } from './board.js';

const boardElement = document.querySelector('#board');
const board = createEmptyBoard();

board.forEach((cells, rowIndex) => {
  const row = document.createElement('div');
  row.className = 'board-row';
  row.setAttribute('role', 'row');
  cells.forEach((_, columnIndex) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `Ряд ${rowIndex + 1}, столбец ${columnIndex + 1}, пусто`);
    row.append(cell);
  });
  boardElement.append(row);
});
