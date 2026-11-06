import { useRef, useState } from 'react';
import { Camera, LoaderCircle } from 'lucide-react';
import { useSync } from '../../lib/sync';

/** A photo shrunk on the phone to at most 1280 px, as JPEG, so it travels light. */
async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  let q = 0.82;
  let url = c.toDataURL('image/jpeg', q);
  while (url.length > 560_000 && q > 0.4) url = c.toDataURL('image/jpeg', (q -= 0.12));
  return url;
}

/**
 * "Сфотографировать станцию": the driver's photo goes to the admin for a
 * look and then into the station's gallery. The camera opens on a phone.
 */
export default function AddStationPhoto({ stationId, className, onNote }: { stationId: string; className: string; onNote: (text: string) => void }) {
  const { actions } = useSync();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const send = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await actions.addDriverPhoto(stationId, await shrink(file));
      onNote('Спасибо! Фото появится в карточке после проверки');
    } catch (e) {
      onNote((e as Error).message || 'Не удалось отправить фото');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      <button onClick={() => input.current?.click()} disabled={busy} aria-label="Добавить фото станции" title="Добавить фото станции" className={className}>
        {busy ? <LoaderCircle size={17} className="animate-spin" /> : <Camera size={17} />}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => void send(e.target.files?.[0])} />
    </>
  );
}
