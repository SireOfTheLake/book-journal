// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import CalendarView from '../src/pages/CalendarView';
import type { CalendarMonth } from '../src/repo/calendar';

it('shows the day card only while hovering, as a fixed overlay, with the worked-out numbers', () => {
  const data: CalendarMonth = {
    year: 2026, month: 10, start: '2026-10-01', end: '2026-10-31', finishes: [], lines: [], pages: {},
    entries: [{ read_id: 'r', book_id: 'b', title: 'Big Book', date: '2026-10-29', page: 150, percent: 50, seconds: null, text: null, gain: { percent: 15, pages: 45, seconds: null } }],
  };
  const noop = () => undefined;
  const { container } = render(<MemoryRouter><CalendarView data={data} today="2026-10-29" canPrev canNext onPrev={noop} onNext={noop} onToday={noop} /></MemoryRouter>);
  expect(container.querySelector('.tip')).toBeNull();
  const cell = screen.getAllByText('29')[0].closest('.cday')!;
  fireEvent.mouseEnter(cell);
  const tip = container.querySelector('.tip') as HTMLElement;
  expect(tip.textContent).toContain('50% · page 150');
  expect(tip.textContent).toContain('+15% · 45 pages that day');
  expect(tip.style.top || tip.style.bottom).not.toBe('');
  fireEvent.mouseLeave(cell);
  expect(container.querySelector('.tip')).toBeNull();
});
