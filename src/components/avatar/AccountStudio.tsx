'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, Check, CreditCard, Dices, Link2, Settings2, Trash2, Upload, UserRound, X } from 'lucide-react';
import {
  ACCESSORY_OPTIONS, AvatarConfig, BACKGROUNDS, BEARD_OPTIONS, DEFAULT_AVATAR, HAIR_COLORS, HAIR_OPTIONS, ITEM_OPTIONS,
  OUTFIT_COLORS, OUTFIT_OPTIONS, RadarAvatar, SKIN_TONES, loadAvatar, saveAvatar, saveDisplayName,
} from './RadarAvatar';

type Section = 'rosto' | 'cabelo' | 'roupa' | 'acessorio' | 'item';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'rosto', label: 'Rosto' }, { id: 'cabelo', label: 'Cabelo' }, { id: 'roupa', label: 'Roupa' },
  { id: 'acessorio', label: 'Acessório' }, { id: 'item', label: 'Item do Radar' },
];

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** Reduz a foto para 256×256 (corte central) antes de guardar no aparelho. */
function resizePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.width, image.height);
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      URL.revokeObjectURL(url);
      if (!context) return reject(new Error('canvas'));
      context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem')); };
    image.src = url;
  });
}

function Swatches({ label, colors, value, onChange }: { label: string; colors: string[]; value: string; onChange: (color: string) => void }) {
  return (
    <fieldset className="rva-field">
      <legend>{label}</legend>
      <div className="rva-swatches">
        {colors.map(color => (
          <button key={color} type="button" className="rva-swatch" style={{ background: color }} aria-label={`Cor ${color}`} aria-pressed={value === color} onClick={() => onChange(color)}>
            {value === color && <Check size={14} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Choices<T extends string>({ label, options, value, onChange, preview }: {
  label: string; options: { id: T; label: string }[]; value: T; onChange: (id: T) => void; preview?: (id: T) => AvatarConfig;
}) {
  return (
    <fieldset className="rva-field">
      <legend>{label}</legend>
      <div className={preview ? 'rva-models' : 'rva-chips'}>
        {options.map(option => (
          <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
            {preview && <RadarAvatar config={preview(option.id)} size={64} />}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function AccountStudio({ userName, userEmail, waPhone, onClose, onSaved }: {
  userName: string; userEmail: string; waPhone: string; onClose: () => void; onSaved: (name: string) => void;
}) {
  const [config, setConfig] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [name, setName] = useState(userName);
  const [section, setSection] = useState<Section>('rosto');
  const [error, setError] = useState<string | null>(null);
  const [bump, setBump] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setConfig(loadAvatar()); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = (patch: Partial<AvatarConfig>) => { setConfig(current => ({ ...current, ...patch })); setBump(value => value + 1); };

  const randomize = () => update({
    mode: 'avatar', skin: pick(SKIN_TONES), hair: pick(HAIR_OPTIONS).id, hairColor: pick(HAIR_COLORS), beard: pick(BEARD_OPTIONS).id,
    outfit: pick(OUTFIT_OPTIONS).id, outfitColor: pick(OUTFIT_COLORS), accessory: pick(ACCESSORY_OPTIONS).id,
    item: pick(ITEM_OPTIONS.filter(option => option.id !== 'nenhum')).id, background: pick(BACKGROUNDS),
  });

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Escolha um arquivo de imagem (JPG ou PNG).'); return; }
    if (file.size > 12 * 1024 * 1024) { setError('A foto precisa ter até 12 MB.'); return; }
    try {
      update({ mode: 'foto', photo: await resizePhoto(file) });
      setError(null);
    } catch {
      setError('Não consegui abrir essa imagem. Tente outra foto.');
    }
  };

  const handleSave = () => {
    const cleanName = name.trim() || userName;
    if (!saveAvatar(config)) { setError('Não consegui salvar neste navegador. Libere o armazenamento do site e tente de novo.'); return; }
    saveDisplayName(cleanName);
    onSaved(cleanName);
  };

  const base = { ...config, mode: 'avatar' as const };

  return (
    <div className="rva-overlay" role="dialog" aria-modal="true" aria-label="Minha conta" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="rva-studio">
        <button type="button" className="rva-close" aria-label="Fechar" onClick={onClose}><X size={18} /></button>

        <aside className="rva-stage">
          <div className="rva-rings" aria-hidden="true"><span /></div>
          <div key={bump} className="rva-hero"><RadarAvatar config={config} size={196} /></div>
          <label className="rva-name">
            <span>Como quer ser chamado</span>
            <input type="text" value={name} maxLength={40} onChange={event => setName(event.target.value)} />
          </label>
          <dl className="rva-facts">
            <div><dt>E-mail</dt><dd>{userEmail || 'Não informado'}</dd></div>
            <div><dt>WhatsApp</dt><dd>{waPhone ? `+${waPhone}` : 'Nenhum número conectado'}</dd></div>
          </dl>
          <div className="rva-links">
            <Link href="/assinatura" onClick={onClose}><CreditCard size={15} /> Minha assinatura</Link>
            <Link href="/conexoes" onClick={onClose}><Link2 size={15} /> Conexões</Link>
            <Link href="/copiador" onClick={onClose}><Settings2 size={15} /> Ajustes de envio</Link>
          </div>
        </aside>

        <section className="rva-editor">
          <header>
            <h2>Seu perfil</h2>
            <p>Monte um personagem ou use uma foto sua. Fica salvo neste aparelho.</p>
          </header>

          <div className="rva-mode" role="group" aria-label="Tipo de imagem do perfil">
            <button type="button" aria-pressed={config.mode === 'avatar'} onClick={() => update({ mode: 'avatar' })}><UserRound size={15} /> Personagem</button>
            <button type="button" aria-pressed={config.mode === 'foto'} onClick={() => (config.photo ? update({ mode: 'foto' }) : fileRef.current?.click())}><Camera size={15} /> Foto</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
          </div>

          {config.mode === 'foto' ? (
            <div className="rva-photo">
              <p>A foto é recortada em formato quadrado e guardada só neste navegador.</p>
              <div className="rva-photo-actions">
                <button type="button" className="rp-btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> Trocar foto</button>
                <button type="button" className="rp-btn rp-quiet" onClick={() => update({ mode: 'avatar', photo: null })}><Trash2 size={15} /> Remover foto</button>
              </div>
            </div>
          ) : (
            <>
              <div className="rva-tabs" role="tablist" aria-label="Parte do personagem">
                {SECTIONS.map(item => (
                  <button key={item.id} type="button" role="tab" aria-selected={section === item.id} onClick={() => setSection(item.id)}>{item.label}</button>
                ))}
              </div>

              <div key={section} className="rva-panel">
                {section === 'rosto' && (
                  <>
                    <Swatches label="Tom de pele" colors={SKIN_TONES} value={config.skin} onChange={skin => update({ skin })} />
                    <Choices label="Barba" options={BEARD_OPTIONS} value={config.beard} onChange={beard => update({ beard })} />
                    <Swatches label="Cor de fundo" colors={BACKGROUNDS} value={config.background} onChange={background => update({ background })} />
                  </>
                )}
                {section === 'cabelo' && (
                  <>
                    <Choices label="Modelos masculinos" options={HAIR_OPTIONS.filter(option => option.group === 'masculino')} value={config.hair} onChange={hair => update({ hair })} preview={hair => ({ ...base, hair, item: 'nenhum', accessory: 'nenhum' })} />
                    <Choices label="Modelos femininos" options={HAIR_OPTIONS.filter(option => option.group === 'feminino')} value={config.hair} onChange={hair => update({ hair })} preview={hair => ({ ...base, hair, item: 'nenhum', accessory: 'nenhum' })} />
                    <Swatches label="Cor do cabelo" colors={HAIR_COLORS} value={config.hairColor} onChange={hairColor => update({ hairColor })} />
                  </>
                )}
                {section === 'roupa' && (
                  <>
                    <Choices label="Peça" options={OUTFIT_OPTIONS} value={config.outfit} onChange={outfit => update({ outfit })} preview={outfit => ({ ...base, outfit, item: 'nenhum' })} />
                    <Swatches label="Cor da roupa" colors={OUTFIT_COLORS} value={config.outfitColor} onChange={outfitColor => update({ outfitColor })} />
                  </>
                )}
                {section === 'acessorio' && (
                  <Choices label="Acessório" options={ACCESSORY_OPTIONS} value={config.accessory} onChange={accessory => update({ accessory })} preview={accessory => ({ ...base, accessory, item: 'nenhum' })} />
                )}
                {section === 'item' && (
                  <Choices label="Um símbolo do Radar ao lado do seu personagem" options={ITEM_OPTIONS} value={config.item} onChange={item => update({ item })} preview={item => ({ ...base, item })} />
                )}
              </div>
            </>
          )}

          {error && <p className="rva-error" role="alert">{error}</p>}

          <footer>
            <button type="button" className="rp-btn" onClick={randomize}><Dices size={15} /> Sortear</button>
            <span />
            <button type="button" className="rp-btn rp-quiet" onClick={onClose}>Cancelar</button>
            <button type="button" className="rp-btn rp-primary" onClick={handleSave}>Salvar perfil</button>
          </footer>
        </section>
      </div>
    </div>
  );
}
