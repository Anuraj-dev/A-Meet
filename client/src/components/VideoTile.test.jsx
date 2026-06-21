import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import VideoTile from './VideoTile';

it('opens the per-speaker volume menu without changing call state', () => {
  const onPeerVolumeChange = vi.fn();
  render(
    <VideoTile
      name="Ada"
      videoOn={false}
      showVolumeControl
      peerVolume={0.5}
      onPeerVolumeChange={onPeerVolumeChange}
    />,
  );

  fireEvent.click(screen.getByRole('button'));

  expect(screen.getByText('Output volume')).toBeInTheDocument();
  expect(screen.getByText('50%')).toBeInTheDocument();
  expect(onPeerVolumeChange).not.toHaveBeenCalled();
});
