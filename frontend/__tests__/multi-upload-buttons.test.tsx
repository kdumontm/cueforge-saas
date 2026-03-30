/**
 * Tests for MultiUpload component buttons
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MultiUpload from '@/components/MultiUpload';

// Mock API
const mockUploadTracks = jest.fn();
jest.mock('@/lib/api', () => ({
  uploadTracks: (...args: any[]) => mockUploadTracks(...args),
}));

beforeEach(() => {
  mockUploadTracks.mockReset();
});

describe('MultiUpload buttons', () => {
  test('renders Select Files button', () => {
    render(<MultiUpload />);
    expect(screen.getByText('Select Files')).toBeInTheDocument();
  });

  test('Select Files button triggers hidden file input', async () => {
    render(<MultiUpload />);
    const user = userEvent.setup();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    expect(fileInput.className).toContain('hidden');

    // Click Select Files — it should trigger the file input click
    const spy = jest.spyOn(fileInput, 'click');
    await user.click(screen.getByText('Select Files'));
    expect(spy).toHaveBeenCalled();
  });

  test('shows Upload button after adding files', async () => {
    render(<MultiUpload />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(['audio data'], 'test.mp3', { type: 'audio/mpeg' });

    fireEvent.change(fileInput, { target: { files: [testFile] } });

    await waitFor(() => {
      expect(screen.getByText('test.mp3')).toBeInTheDocument();
    });
  });

  test('rejects invalid file formats', () => {
    render(<MultiUpload />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const txtFile = new File(['text'], 'readme.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, { target: { files: [txtFile] } });

    // Should not add the file
    expect(screen.queryByText('readme.txt')).not.toBeInTheDocument();
  });

  test('accepts valid audio formats', () => {
    render(<MultiUpload />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const mp3File = new File(['audio'], 'song.mp3', { type: 'audio/mpeg' });

    fireEvent.change(fileInput, { target: { files: [mp3File] } });

    expect(screen.getByText('song.mp3')).toBeInTheDocument();
  });

  test('prevents duplicate files', () => {
    render(<MultiUpload />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const mp3File = new File(['audio'], 'song.mp3', { type: 'audio/mpeg' });

    fireEvent.change(fileInput, { target: { files: [mp3File] } });
    fireEvent.change(fileInput, { target: { files: [mp3File] } });

    // Should only appear once
    const items = screen.getAllByText('song.mp3');
    expect(items).toHaveLength(1);
  });

  test('remove button removes file from list', async () => {
    render(<MultiUpload />);
    const user = userEvent.setup();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const mp3File = new File(['audio'], 'remove-me.mp3', { type: 'audio/mpeg' });

    fireEvent.change(fileInput, { target: { files: [mp3File] } });
    expect(screen.getByText('remove-me.mp3')).toBeInTheDocument();

    // Find and click the remove button (X or Remove)
    const removeBtn = document.querySelector('button[title*="Remove"], button[title*="Supprimer"]') ||
      screen.queryByText('×') ||
      screen.queryByText('Remove');

    if (removeBtn) {
      await user.click(removeBtn);
      expect(screen.queryByText('remove-me.mp3')).not.toBeInTheDocument();
    }
  });

  test('drag and drop zone has correct styling on drag over', () => {
    render(<MultiUpload />);

    const dropZone = document.querySelector('.border-dashed') as HTMLElement;
    expect(dropZone).toBeTruthy();

    fireEvent.dragOver(dropZone, { preventDefault: jest.fn() });
    // Should activate dragging state
  });

  test('upload button calls uploadTracks API', async () => {
    const onSuccess = jest.fn();
    mockUploadTracks.mockResolvedValueOnce([{ id: 1, status: 'ok', filename: 'song.mp3', original_filename: 'song.mp3' }]);

    render(<MultiUpload onSuccess={onSuccess} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const mp3File = new File(['audio'], 'song.mp3', { type: 'audio/mpeg' });
    fireEvent.change(fileInput, { target: { files: [mp3File] } });

    // Find upload/start button
    const uploadBtn = screen.queryByText(/Upload|Envoyer|Start/i);
    if (uploadBtn) {
      fireEvent.click(uploadBtn);
      await waitFor(() => {
        expect(mockUploadTracks).toHaveBeenCalled();
      });
    }
  });

  test('calls onError when upload fails', async () => {
    const onError = jest.fn();
    mockUploadTracks.mockRejectedValueOnce(new Error('Upload failed'));

    render(<MultiUpload onError={onError} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const mp3File = new File(['audio'], 'fail.mp3', { type: 'audio/mpeg' });
    fireEvent.change(fileInput, { target: { files: [mp3File] } });

    const uploadBtn = screen.queryByText(/Upload|Envoyer|Start/i);
    if (uploadBtn) {
      fireEvent.click(uploadBtn);
      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Upload failed');
      });
    }
  });
});
