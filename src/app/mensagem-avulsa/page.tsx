'use client';

import React, { useEffect, useState } from 'react';
import { FileEdit, Send, Calendar, Image as ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { WhatsAppGroup } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';

export default function MensagemAvulsaPage() {
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState('');
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/copier/sources')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.groups) {
          const dests = data.groups.filter((g: any) => g.isDestination || !g.isOrigin);
          setGroups(dests);
          if (dests.length > 0) setSelectedGroups([dests[0].groupJid]);
        }
      })
      .catch(() => {});
  }, []);

  const handleSend = async (immediate: boolean) => {
    if (!text.trim()) {
      alert('Digite o texto da mensagem.');
      return;
    }
    if (selectedGroups.length === 0) {
      alert('Selecione pelo menos um grupo de destino.');
      return;
    }

    setSending(true);
    setStatusMessage(null);

    try {
      for (const destJid of selectedGroups) {
        const destGroup = groups.find((g) => g.groupJid === destJid);
        await fetch('/api/copier/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            jobData: {
              originType: 'manual',
              targetJid: destJid,
              targetName: destGroup?.name || destJid,
              messageText: text.trim(),
              mediaUrl: mediaUrl.trim() || undefined,
              mediaType: mediaUrl.trim() ? 'image' : 'none',
              scheduledFor: immediate
                ? new Date().toISOString()
                : scheduleDate || new Date().toISOString(),
            },
          }),
        });
      }

      if (immediate) {
        await fetch('/api/worker/trigger', { method: 'POST' }).catch(() => {});
        setStatusMessage({
          type: 'success',
          text: 'Mensagem avulsa enviada com sucesso para os grupos!',
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: 'Mensagem avulsa programada na agenda com sucesso!',
        });
      }
      setText('');
      setMediaUrl('');
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: 'Ocorreu um erro ao disparar a mensagem avulsa.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] tracking-tight">
          Mensagem Avulsa
        </h1>
        <p className="text-xs sm:text-sm text-[#8EADC7] mt-0.5">
          Envie comunicados livres, avisos de promoções ou mensagens personalizadas com imagem para seus canais.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Editor */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 sm:p-5 space-y-3.5">
            <div>
              <label className="text-xs font-bold text-[#F8FBFF] block mb-1.5">
                Texto da Mensagem (Formatação WhatsApp: *negrito*, _itálico_, ~tachado~)
              </label>
              <textarea
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Digite seu comunicado ou mensagem especial aqui..."
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl p-3.5 text-xs text-[#F8FBFF] placeholder-[#8EADC7]/40 focus:outline-none focus:border-[#1CCAF2] resize-y"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                URL da Imagem (Opcional)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://exemplo.com/banner-promocao.jpg"
                  className="flex-1 bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                />
              </div>
            </div>
          </div>

          {/* Destinos */}
          <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 sm:p-5 space-y-3">
            <h2 className="text-xs font-bold text-[#F8FBFF]">Destinos WhatsApp</h2>
            <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-[#061225] rounded-xl border border-[#18334D]">
              {groups.map((grp) => (
                <label key={grp.groupJid} className="flex items-center gap-2 text-xs text-[#F8FBFF] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(grp.groupJid)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedGroups([...selectedGroups, grp.groupJid]);
                      } else {
                        setSelectedGroups(selectedGroups.filter((j) => j !== grp.groupJid));
                      }
                    }}
                    className="rounded border-[#18334D] text-[#1CCAF2] focus:ring-0"
                  />
                  <span>{grp.name}</span>
                </label>
              ))}
            </div>

            <div>
              <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                Data/Hora do Envio (Opcional)
              </label>
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>
          </div>
        </div>

        {/* Prévia */}
        <div className="lg:col-span-5 flex flex-col">
          <div className="sticky top-20 rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 sm:p-5 flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wider text-[#1CCAF2] mb-3">
              Prévia do Comunicado
            </span>

            {mediaUrl && (
              <div className="mb-3 rounded-xl overflow-hidden border border-[#18334D] max-h-48 bg-[#061225]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl} alt="Prévia" className="w-full h-full object-cover" />
              </div>
            )}

            <div className="p-4 rounded-2xl bg-[#061225] border border-[#18334D] text-xs text-[#F8FBFF] whitespace-pre-wrap leading-relaxed min-h-24">
              {text || 'Digite o texto ao lado para visualizar a prévia aqui...'}
            </div>

            {statusMessage && (
              <div
                className={`mt-3 p-2.5 rounded-xl text-xs font-medium border flex items-center gap-2 ${
                  statusMessage.type === 'success'
                    ? 'bg-[#20C997]/10 border-[#20C997]/30 text-[#20C997]'
                    : 'bg-[#F87171]/10 border-[#F87171]/30 text-[#F87171]'
                }`}
              >
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button
                onClick={() => handleSend(false)}
                disabled={sending}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-[#0D1B31] border border-[#18334D] text-[#8EADC7] hover:text-[#F8FBFF] transition-all"
              >
                <Calendar className="w-4 h-4" />
                <span>Agendar</span>
              </button>

              <button
                onClick={() => handleSend(true)}
                disabled={sending}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] shadow-lg shadow-[#1CCAF2]/20 hover:opacity-95 transition-all"
              >
                <Send className="w-4 h-4" />
                <span>Enviar Agora</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
