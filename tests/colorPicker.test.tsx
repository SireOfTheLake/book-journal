// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ColorPicker from '../src/ui/ColorPicker';
import { formatColor, parseColor } from '../src/domain/colorConv';

describe('color codes', () => {
  it('converts between HEX, RGB and HSL', () => {
    expect(formatColor('#ff0000', 'RGB')).toBe('255, 0, 0');
    expect(formatColor('#ff0000', 'HSL')).toBe('0, 100%, 50%');
    expect(parseColor('0, 255, 0', 'RGB')).toBe('#00ff00');
    expect(parseColor('240, 100%, 50%', 'HSL')).toBe('#0000ff');
    expect(parseColor('abc', 'HEX')).toBe('#aabbcc');
    expect(parseColor('nope', 'HEX')).toBeNull();
    expect(parseColor('300, 0, 0', 'RGB')).toBeNull();
  });
});

describe('the color picker', () => {
  it('shows HEX first, takes a typed code, and picks from the month colors', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#c4683d" onChange={onChange} />);
    expect((screen.getByLabelText('HEX code') as HTMLInputElement).value).toBe('#c4683d');
    expect(screen.getByRole('img', { name: 'Color wheel' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('HEX code'), { target: { value: '#112233' } });
    fireEvent.keyDown(screen.getByLabelText('HEX code'), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('#112233');
    fireEvent.change(screen.getByLabelText('Color code'), { target: { value: 'RGB' } });
    expect((screen.getByLabelText('RGB code') as HTMLInputElement).value).toBe('17, 34, 51');
    fireEvent.click(screen.getByRole('button', { name: 'Use color #d3a05c' }));
    expect(onChange).toHaveBeenLastCalledWith('#d3a05c');
  });
});
