'use client';

import { useEffect, useState } from 'react';

/** Selo " · #N" com o grupo para onde o botão está mandando agora. */
export default function GroupNumber() {
  const [number, setNumber] = useState<number | null>(null);
  useEffect(() => {
    fetch('/grupo/atual')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (Number.isInteger(data?.number)) setNumber(data.number); })
      .catch(() => {});
  }, []);
  return number ? <> · #{number}</> : null;
}
