// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { promptFromFileName } from '../src/domain/challenges';
import StickerStaging, { type Staged } from '../src/pages/challenges/StickerStaging';

vi.mock('../src/ui/imageFile', () => ({ fileToDataUrl: async () => ({ dataUrl: 'data:image/png;base64,x', width: 1, height: 1, mime: 'image/png' }) }));
afterEach(cleanup);

describe('prompt from a sticker file name', () => {
  it('uses the name without the extension', () => {
    expect(promptFromFileName('France.jpg')).toBe('France');
    expect(promptFromFileName('Costa_Rica.PNG')).toBe('Costa Rica');
    expect(promptFromFileName('New Zealand (2).png')).toBe('New Zealand');
    expect(promptFromFileName('C:\\stickers\\Peru.webp')).toBe('Peru');
    expect(promptFromFileName('my.sticker.name.png')).toBe('my.sticker.name');
    expect(promptFromFileName('.png')).toBe('');
  });
});

describe('uploading stickers', () => {
  it('fills each prompt with its file name, which can still be changed', async () => {
    function Host() { const [v, set] = useState<Staged[]>([]); return <StickerStaging value={v} onChange={set} />; }
    render(<Host />);
    const input = screen.getByLabelText('Upload stickers') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['a'], 'France.jpg', { type: 'image/jpeg' }), new File(['b'], 'Costa_Rica.png', { type: 'image/png' })] } });
    await waitFor(() => expect((screen.getByLabelText('Prompt for sticker 1') as HTMLInputElement).value).toBe('France'));
    expect((screen.getByLabelText('Prompt for sticker 2') as HTMLInputElement).value).toBe('Costa Rica');
    fireEvent.change(screen.getByLabelText('Prompt for sticker 1'), { target: { value: 'Paris' } });
    expect((screen.getByLabelText('Prompt for sticker 1') as HTMLInputElement).value).toBe('Paris');
  });
});
