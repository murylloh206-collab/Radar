'use client';

import React, { useEffect, useId, useState } from 'react';

export type HairStyle =
  | 'careca' | 'raspado' | 'curto' | 'topete' | 'cacheado' | 'blackpower'
  | 'longo' | 'chanel' | 'coque' | 'rabo' | 'ondulado' | 'trancas';
export type Outfit = 'camiseta' | 'moletom' | 'blazer' | 'polo' | 'regata';
export type Accessory = 'nenhum' | 'oculos' | 'escuros' | 'fone' | 'bone' | 'brincos';
export type Beard = 'nenhuma' | 'barba' | 'bigode';
export type PlatformItem = 'nenhum' | 'radar' | 'etiqueta' | 'foguete' | 'moeda' | 'raio';

export interface AvatarConfig {
  mode: 'avatar' | 'foto';
  photo: string | null;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  beard: Beard;
  outfit: Outfit;
  outfitColor: string;
  accessory: Accessory;
  item: PlatformItem;
  background: string;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  mode: 'avatar', photo: null, skin: '#e0ac69', hair: 'curto', hairColor: '#2b1d14', beard: 'nenhuma',
  outfit: 'moletom', outfitColor: '#18181b', accessory: 'nenhum', item: 'radar', background: '#f5c542',
};

export const SKIN_TONES = ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'];
export const HAIR_COLORS = ['#141414', '#2b1d14', '#5a3825', '#a0622d', '#d9b36c', '#b03a2e', '#9aa0a6', '#f5c542', '#ec4899', '#3b82f6'];
export const OUTFIT_COLORS = ['#18181b', '#f6f2e8', '#f5c542', '#b91c1c', '#1d4ed8', '#15803d', '#7c3aed', '#ea580c'];
export const BACKGROUNDS = ['#f5c542', '#18181b', '#f6f2e8', '#0f766e', '#7c3aed', '#be123c', '#1d4ed8', '#ea580c'];

export const HAIR_OPTIONS: { id: HairStyle; label: string; group: 'masculino' | 'feminino' }[] = [
  { id: 'curto', label: 'Curto', group: 'masculino' },
  { id: 'topete', label: 'Topete', group: 'masculino' },
  { id: 'raspado', label: 'Raspado', group: 'masculino' },
  { id: 'cacheado', label: 'Cacheado', group: 'masculino' },
  { id: 'blackpower', label: 'Black power', group: 'masculino' },
  { id: 'careca', label: 'Careca', group: 'masculino' },
  { id: 'longo', label: 'Longo liso', group: 'feminino' },
  { id: 'ondulado', label: 'Ondulado', group: 'feminino' },
  { id: 'chanel', label: 'Chanel', group: 'feminino' },
  { id: 'coque', label: 'Coque', group: 'feminino' },
  { id: 'rabo', label: 'Rabo de cavalo', group: 'feminino' },
  { id: 'trancas', label: 'Tranças', group: 'feminino' },
];
export const OUTFIT_OPTIONS: { id: Outfit; label: string }[] = [
  { id: 'moletom', label: 'Moletom' }, { id: 'camiseta', label: 'Camiseta' }, { id: 'polo', label: 'Polo' },
  { id: 'blazer', label: 'Blazer' }, { id: 'regata', label: 'Regata' },
];
export const ACCESSORY_OPTIONS: { id: Accessory; label: string }[] = [
  { id: 'nenhum', label: 'Nenhum' }, { id: 'oculos', label: 'Óculos' }, { id: 'escuros', label: 'Óculos escuros' },
  { id: 'fone', label: 'Fone' }, { id: 'bone', label: 'Boné' }, { id: 'brincos', label: 'Brincos' },
];
export const BEARD_OPTIONS: { id: Beard; label: string }[] = [
  { id: 'nenhuma', label: 'Sem barba' }, { id: 'barba', label: 'Barba' }, { id: 'bigode', label: 'Bigode' },
];
export const ITEM_OPTIONS: { id: PlatformItem; label: string }[] = [
  { id: 'radar', label: 'Radar' }, { id: 'etiqueta', label: 'Etiqueta de oferta' }, { id: 'foguete', label: 'Foguete' },
  { id: 'moeda', label: 'Moeda' }, { id: 'raio', label: 'Oferta relâmpago' }, { id: 'nenhum', label: 'Nenhum' },
];

const STORAGE_KEY = 'radar-conta-avatar-v1';
const NAME_KEY = 'radar-conta-nome-v1';
const CHANGE_EVENT = 'radar-avatar-change';

/** O avatar fica salvo só neste aparelho (localStorage); nada vai para o servidor. */
export function loadAvatar(): AvatarConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AVATAR;
    return { ...DEFAULT_AVATAR, ...(JSON.parse(raw) as Partial<AvatarConfig>) };
  } catch {
    return DEFAULT_AVATAR;
  }
}

export function saveAvatar(config: AvatarConfig): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function loadDisplayName(): string | null {
  try { return window.localStorage.getItem(NAME_KEY); } catch { return null; }
}

export function saveDisplayName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch { /* armazenamento indisponível: segue sem salvar */ }
}

/** Avatar salvo neste aparelho; `null` até carregar (evita diferença entre servidor e navegador). */
export function useSavedAvatar(): { avatar: AvatarConfig | null; name: string | null } {
  const [state, setState] = useState<{ avatar: AvatarConfig | null; name: string | null }>({ avatar: null, name: null });
  useEffect(() => {
    const read = () => setState({ avatar: loadAvatar(), name: loadDisplayName() });
    read();
    window.addEventListener(CHANGE_EVENT, read);
    return () => window.removeEventListener(CHANGE_EVENT, read);
  }, []);
  return state;
}

function shade(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const channel = (index: number) => {
    const base = parseInt(value.slice(index, index + 2), 16);
    const next = amount < 0 ? base * (1 + amount) : base + (255 - base) * amount;
    return Math.max(0, Math.min(255, Math.round(next))).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

const isLight = (hex: string) => {
  const v = hex.replace('#', '');
  return (parseInt(v.slice(0, 2), 16) * 299 + parseInt(v.slice(2, 4), 16) * 587 + parseInt(v.slice(4, 6), 16) * 114) / 1000 > 150;
};

function HairBack({ style, color }: { style: HairStyle; color: string }) {
  switch (style) {
    case 'longo':
      return <path d="M56 88 C54 40 146 40 144 88 L149 162 Q149 170 139 168 L61 168 Q51 170 51 162 Z" fill={color} />;
    case 'ondulado':
      return <path d="M56 88 C52 38 148 38 144 88 C156 104 142 116 152 132 C160 148 146 160 150 170 L50 170 C54 160 40 148 48 132 C58 116 44 104 56 88 Z" fill={color} />;
    case 'chanel':
      return <path d="M55 88 C53 40 147 40 145 88 L148 124 Q148 134 136 132 L64 132 Q52 134 52 124 Z" fill={color} />;
    case 'rabo':
      return <path d="M132 52 C160 50 168 84 160 116 C156 134 148 146 140 150 C148 124 146 96 130 76 Z" fill={color} />;
    case 'coque':
      return <circle cx="100" cy="34" r="17" fill={color} />;
    case 'blackpower':
      return <circle cx="100" cy="70" r="60" fill={color} />;
    case 'trancas':
      return (
        <g fill={color}>
          {[96, 110, 124, 138, 152].map((y, i) => <circle key={`l${y}`} cx={58 - (i % 2)} cy={y} r={8.5 - i * 0.5} />)}
          {[96, 110, 124, 138, 152].map((y, i) => <circle key={`r${y}`} cx={142 + (i % 2)} cy={y} r={8.5 - i * 0.5} />)}
        </g>
      );
    default:
      return null;
  }
}

function HairFront({ style, color }: { style: HairStyle; color: string }) {
  const cap = 'M61 86 C57 48 80 36 100 36 C120 36 143 48 139 86 C133 66 120 58 100 58 C80 58 67 66 61 86 Z';
  switch (style) {
    case 'careca':
      return null;
    case 'raspado':
      return <path d="M62 82 C60 52 80 42 100 42 C120 42 140 52 138 82 C130 62 118 56 100 56 C82 56 70 62 62 82 Z" fill={color} opacity="0.55" />;
    case 'curto':
      return <path d={cap} fill={color} />;
    case 'topete':
      return <path d="M61 86 C57 50 76 40 92 38 C98 22 128 24 134 44 C142 54 141 72 139 86 C134 68 124 60 104 60 C84 60 67 66 61 86 Z" fill={color} />;
    case 'cacheado':
      return (
        <g fill={color}>
          <path d={cap} />
          {[[70, 52], [84, 42], [100, 38], [116, 42], [130, 52], [64, 68], [136, 68]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="11" />)}
        </g>
      );
    case 'blackpower':
      return <path d="M62 84 C62 62 78 54 100 54 C122 54 138 62 138 84 C130 70 118 64 100 64 C82 64 70 70 62 84 Z" fill={color} />;
    case 'longo':
    case 'chanel':
      return <path d="M60 90 C56 48 80 36 100 36 C120 36 144 48 140 90 C134 66 118 56 96 58 C82 60 66 70 60 90 Z" fill={color} />;
    case 'ondulado':
      return <path d="M60 90 C54 46 80 34 102 36 C124 36 146 50 140 90 C136 70 124 60 112 58 C102 66 76 62 60 90 Z" fill={color} />;
    case 'coque':
    case 'rabo':
      return <path d="M61 84 C58 48 80 38 100 38 C120 38 142 48 139 84 C132 62 118 54 100 54 C82 54 68 62 61 84 Z" fill={color} />;
    case 'trancas':
      return (
        <g>
          <path d={cap} fill={color} />
          <path d="M100 38 L100 58" stroke={shade(color, 0.25)} strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    default:
      return null;
  }
}

function OutfitLayer({ outfit, color, skin }: { outfit: Outfit; color: string; skin: string }) {
  const dark = shade(color, -0.28);
  const body = 'M26 200 C26 158 58 142 100 142 C142 142 174 158 174 200 Z';
  switch (outfit) {
    case 'camiseta':
      return <g><path d={body} fill={color} /><path d="M80 143 Q100 164 120 143 Q100 152 80 143 Z" fill={skin} /><path d="M80 143 Q100 164 120 143" fill="none" stroke={dark} strokeWidth="3" /></g>;
    case 'regata':
      return <g><path d="M26 200 C26 160 50 148 66 146 L76 142 Q100 172 124 142 L134 146 C150 148 174 160 174 200 Z" fill={skin} /><path d="M58 200 L66 150 Q100 184 134 150 L142 200 Z" fill={color} /></g>;
    case 'polo':
      return <g><path d={body} fill={color} /><path d="M84 142 L100 164 L116 142 Z" fill={skin} /><path d="M78 140 L100 166 L92 174 L70 150 Z" fill={dark} /><path d="M122 140 L100 166 L108 174 L130 150 Z" fill={dark} /><circle cx="100" cy="182" r="2.2" fill={dark} /></g>;
    case 'blazer':
      return <g><path d={body} fill={color} /><path d="M82 142 L100 190 L118 142 Z" fill="#f6f2e8" /><path d="M82 142 L100 190 L84 200 L62 152 Z" fill={dark} /><path d="M118 142 L100 190 L116 200 L138 152 Z" fill={dark} /><path d="M96 150 L104 150 L107 176 L100 186 L93 176 Z" fill="#f5c542" /></g>;
    case 'moletom':
    default:
      return <g><path d="M60 150 C62 126 138 126 140 150 L134 160 L66 160 Z" fill={dark} /><path d={body} fill={color} /><path d="M78 144 Q100 170 122 144 Q100 158 78 144 Z" fill={dark} /><path d="M90 160 L88 184 M110 160 L112 184" stroke={isLight(color) ? '#18181b' : '#f6f2e8'} strokeWidth="2.4" strokeLinecap="round" /></g>;
  }
}

function AccessoryLayer({ accessory, hairColor }: { accessory: Accessory; hairColor: string }) {
  switch (accessory) {
    case 'oculos':
      return <g fill="rgba(255,255,255,0.18)" stroke="#18181b" strokeWidth="3"><rect x="70" y="80" width="26" height="20" rx="8" /><rect x="104" y="80" width="26" height="20" rx="8" /><path d="M96 88 Q100 85 104 88 M70 88 L62 85 M130 88 L138 85" fill="none" /></g>;
    case 'escuros':
      return <g stroke="#0b0b0c" strokeWidth="3"><rect x="68" y="80" width="29" height="19" rx="7" fill="#0b0b0c" /><rect x="103" y="80" width="29" height="19" rx="7" fill="#0b0b0c" /><path d="M97 86 L103 86 M68 86 L61 84 M132 86 L139 84" fill="none" /><path d="M73 85 L84 85 M108 85 L119 85" stroke="rgba(245,197,66,0.75)" strokeWidth="2" strokeLinecap="round" /></g>;
    case 'fone':
      return <g><path d="M58 92 C54 30 146 30 142 92" fill="none" stroke="#18181b" strokeWidth="7" strokeLinecap="round" /><rect x="50" y="80" width="16" height="30" rx="8" fill="#18181b" /><rect x="134" y="80" width="16" height="30" rx="8" fill="#18181b" /><rect x="53" y="86" width="4" height="18" rx="2" fill="#f5c542" /><rect x="143" y="86" width="4" height="18" rx="2" fill="#f5c542" /></g>;
    case 'bone':
      return <g><path d="M60 72 C60 36 140 36 140 72 Z" fill="#18181b" /><path d="M58 72 L146 72 C162 72 170 80 168 84 L62 80 Z" fill="#f5c542" /><circle cx="100" cy="56" r="8" fill="none" stroke="#f5c542" strokeWidth="2.4" /><circle cx="100" cy="56" r="2.4" fill="#f5c542" /></g>;
    case 'brincos':
      return <g fill="#f5c542" stroke="#b8860b" strokeWidth="1"><circle cx="61" cy="106" r="5" /><circle cx="139" cy="106" r="5" /></g>;
    default:
      return hairColor ? null : null;
  }
}

function ItemBadge({ item, uid }: { item: PlatformItem; uid: string }) {
  if (item === 'nenhum') return null;
  const base = <circle cx="158" cy="158" r="30" fill="#0e0e10" stroke="#f5c542" strokeWidth="3" />;
  if (item === 'radar') {
    return (
      <g>
        {base}
        <circle cx="158" cy="158" r="20" fill="none" stroke="rgba(245,197,66,0.45)" strokeWidth="1.5" />
        <circle cx="158" cy="158" r="11" fill="none" stroke="rgba(245,197,66,0.45)" strokeWidth="1.5" />
        <g className="rva-sweep" style={{ transformOrigin: '158px 158px' }}>
          <path d="M158 158 L158 134 A24 24 0 0 1 180 149 Z" fill={`url(#${uid}-sweep)`} />
        </g>
        <circle cx="158" cy="158" r="3" fill="#f5c542" />
        <circle className="rva-blip" cx="168" cy="147" r="2.6" fill="#fff3c4" />
      </g>
    );
  }
  if (item === 'etiqueta') {
    return <g>{base}<path d="M142 150 L160 140 L176 150 L176 172 L142 172 Z" fill="#f5c542" /><circle cx="160" cy="149" r="3" fill="#0e0e10" /><text x="159" y="168" textAnchor="middle" fontSize="15" fontWeight="800" fill="#171204" fontFamily="system-ui, sans-serif">%</text></g>;
  }
  if (item === 'foguete') {
    return <g>{base}<g className="rva-float"><path d="M158 136 C170 146 170 164 164 172 L152 172 C146 164 146 146 158 136 Z" fill="#f6f2e8" /><circle cx="158" cy="154" r="4.5" fill="#f5c542" /><path d="M152 166 L144 176 L152 174 Z M164 166 L172 176 L164 174 Z" fill="#f5c542" /><path d="M154 173 L158 184 L162 173 Z" fill="#ea580c" /></g></g>;
  }
  if (item === 'moeda') {
    return <g>{base}<circle cx="158" cy="158" r="19" fill="#f5c542" stroke="#b8860b" strokeWidth="2.5" /><text x="158" y="165" textAnchor="middle" fontSize="19" fontWeight="800" fill="#171204" fontFamily="system-ui, sans-serif">$</text></g>;
  }
  return <g>{base}<path d="M163 136 L146 162 L157 162 L152 181 L171 153 L159 153 Z" fill="#f5c542" stroke="#b8860b" strokeWidth="1.2" strokeLinejoin="round" /></g>;
}

/** Avatar do usuário: foto enviada ou personagem montado. Só desenho, sem dados. */
export function RadarAvatar({ config, size = 40, className = '' }: { config: AvatarConfig; size?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  if (config.mode === 'foto' && config.photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={config.photo} alt="Foto do perfil" width={size} height={size} className={`rva-avatar ${className}`} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
    );
  }

  const skinShade = shade(config.skin, -0.16);
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={`rva-avatar ${className}`} role="img" aria-label="Avatar do perfil">
      <defs>
        <clipPath id={`${uid}-clip`}><circle cx="100" cy="100" r="100" /></clipPath>
        <radialGradient id={`${uid}-bg`} cx="35%" cy="25%" r="90%">
          <stop offset="0" stopColor={shade(config.background, 0.3)} />
          <stop offset="1" stopColor={shade(config.background, -0.25)} />
        </radialGradient>
        <linearGradient id={`${uid}-sweep`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(245,197,66,0)" />
          <stop offset="1" stopColor="rgba(245,197,66,0.85)" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${uid}-clip)`}>
        <rect width="200" height="200" fill={`url(#${uid}-bg)`} />
        <HairBack style={config.hair} color={config.hairColor} />
        <OutfitLayer outfit={config.outfit} color={config.outfitColor} skin={config.skin} />
        <rect x="86" y="118" width="28" height="34" rx="11" fill={skinShade} />
        <circle cx="62" cy="92" r="7.5" fill={config.skin} />
        <circle cx="138" cy="92" r="7.5" fill={config.skin} />
        <ellipse cx="100" cy="88" rx="38" ry="44" fill={config.skin} />
        {config.beard === 'barba' && <path d="M64 96 C66 132 86 138 100 138 C114 138 134 132 136 96 C128 112 116 116 100 116 C84 116 72 112 64 96 Z" fill={config.hairColor} opacity="0.92" />}
        <ellipse cx="78" cy="104" rx="7" ry="4.5" fill="#ff8a8a" opacity="0.28" />
        <ellipse cx="122" cy="104" rx="7" ry="4.5" fill="#ff8a8a" opacity="0.28" />
        <g className="rva-eyes" style={{ transformOrigin: '100px 90px' }}>
          <circle cx="84" cy="90" r="4" fill="#1b1b1b" />
          <circle cx="116" cy="90" r="4" fill="#1b1b1b" />
          <circle cx="85.4" cy="88.6" r="1.3" fill="#fff" />
          <circle cx="117.4" cy="88.6" r="1.3" fill="#fff" />
        </g>
        <path d="M76 79 Q84 74 92 78 M108 78 Q116 74 124 79" fill="none" stroke={shade(config.hairColor, -0.1)} strokeWidth="3" strokeLinecap="round" />
        <path d="M88 108 Q100 119 112 108" fill="none" stroke="#7a2e2e" strokeWidth="3.2" strokeLinecap="round" />
        {config.beard === 'bigode' && <path d="M84 104 Q92 98 100 103 Q108 98 116 104 Q108 108 100 106 Q92 108 84 104 Z" fill={config.hairColor} />}
        <HairFront style={config.hair} color={config.hairColor} />
        <AccessoryLayer accessory={config.accessory} hairColor={config.hairColor} />
      </g>
      <ItemBadge item={config.item} uid={uid} />
    </svg>
  );
}
