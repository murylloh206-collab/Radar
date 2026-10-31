'use client';

import { useEffect, useRef, useState } from 'react';
import { UserRound, Users } from 'lucide-react';
import { safeWhatsAppPictureUrl } from '@/lib/server/whatsapp-picture';

// -----------------------------------------------------------------------------
// Fila de Concorrência Limitada (Client-Side)
// Impede rajadas de requisições concorrentes ao navegar por listas com dezenas de grupos
// -----------------------------------------------------------------------------
const MAX_CONCURRENT_PHOTO_REQUESTS = 4;
let activeRequestsCount = 0;
const waitingQueue: Array<() => void> = [];

function enqueuePhotoTask(task: () => Promise<void>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const execute = () => {
      activeRequestsCount++;
      task()
        .then(
          () => {
            activeRequestsCount--;
            processNextQueueTask();
            resolve();
          },
          (err) => {
            activeRequestsCount--;
            processNextQueueTask();
            reject(err);
          }
        );
    };

    if (activeRequestsCount < MAX_CONCURRENT_PHOTO_REQUESTS) {
      execute();
    } else {
      waitingQueue.push(execute);
    }
  });
}

function processNextQueueTask() {
  while (activeRequestsCount < MAX_CONCURRENT_PHOTO_REQUESTS && waitingQueue.length > 0) {
    const nextTask = waitingQueue.shift();
    if (nextTask) nextTask();
  }
}

// -----------------------------------------------------------------------------
// Cache em Memória no Cliente
// Separação estrita por [connectionId, ownerJid, targetId]
// -----------------------------------------------------------------------------
interface ClientCachedPhoto {
  pictureUrl: string | null;
  statusMessage?: string;
  expires: number;
}
const photoClientCache = new Map<string, ClientCachedPhoto>();

function getCacheKey(
  connectionId?: string,
  ownerJid?: string,
  personal?: boolean,
  groupJid?: string
): string {
  const conn = connectionId || 'global';
  const owner = ownerJid || 'no-owner';
  const target = personal ? 'account' : groupJid || 'no-group';
  return `${conn}:${owner}:${target}`;
}

export interface WhatsAppAvatarProps {
  personal?: boolean;
  connectionId?: string;
  ownerJid?: string;
  groupJid?: string;
  initialUrl?: string | null;
  name: string;
  className?: string;
  accountCardMode?: boolean;
  size?: number;
}

export default function WhatsAppAvatar({
  personal = false,
  connectionId,
  ownerJid,
  groupJid,
  initialUrl,
  name,
  className,
  accountCardMode = false,
  size,
}: WhatsAppAvatarProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  // Sanitização da URL inicial (seja foto salva no cadastro ou nos metadados do grupo)
  const validatedInitialUrl = safeWhatsAppPictureUrl(initialUrl);

  const [pictureUrl, setPictureUrl] = useState<string | null>(validatedInitialUrl);
  const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);

  // Rastreia a chave atual para descarte imediato de respostas atrasadas (race conditions)
  const currentKey = getCacheKey(connectionId, ownerJid, personal, groupJid);
  const activeKeyRef = useRef(currentKey);
  activeKeyRef.current = currentKey;

  // Rastreia retries do onError da imagem (limita a 1 retry com refresh=1 para evitar loops)
  const retryCountRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Ao mudar qualquer parâmetro da conta, grupo ou conexão:
    // 1. Cancela requisições anteriores em andamento
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 2. Reseta contadores e limpa imediatamente a imagem anterior
    retryCountRef.current = 0;
    const validatedInit = safeWhatsAppPictureUrl(initialUrl);

    if (validatedInit) {
      setPictureUrl(validatedInit);
      setStatusMessage(undefined);
      return;
    }

    setPictureUrl(null);

    // Se a conexão não tem número conectado ou parâmetros incompletos
    if (!ownerJid || !connectionId || (!personal && !groupJid)) {
      if (!ownerJid) {
        setStatusMessage('Conta desconectada ou não pareada.');
      }
      return;
    }

    // 3. Verifica cache client
    const cached = photoClientCache.get(currentKey);
    if (cached && cached.expires > Date.now()) {
      setPictureUrl(cached.pictureUrl);
      setStatusMessage(cached.statusMessage);
      return;
    }

    // 4. Executa fetch controlado sob demanda
    let isSubscribed = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function fetchPhoto(forceRefresh = false) {
      if (!isSubscribed || activeKeyRef.current !== currentKey) return;

      try {
        await enqueuePhotoTask(async () => {
          if (!isSubscribed || controller.signal.aborted || activeKeyRef.current !== currentKey) {
            return;
          }

          const params = new URLSearchParams();
          if (personal) {
            params.set('account', '1');
          } else if (groupJid) {
            params.set('groupJid', groupJid);
          }
          if (connectionId) params.set('connectionId', connectionId);
          if (ownerJid) params.set('ownerJid', ownerJid);
          if (forceRefresh) params.set('refresh', '1');

          const response = await fetch(`/api/whatsapp/groups/photo?${params.toString()}`, {
            signal: controller.signal,
            cache: 'no-store',
          });

          const data = await response.json();

          if (!isSubscribed || activeKeyRef.current !== currentKey) return;

          if (response.ok && data.ok) {
            const safeUrl = safeWhatsAppPictureUrl(data.pictureUrl);
            const msg = safeUrl ? undefined : 'Foto privada ou não definida.';
            setPictureUrl(safeUrl);
            setStatusMessage(msg);
            photoClientCache.set(currentKey, {
              pictureUrl: safeUrl,
              statusMessage: msg,
              expires: Date.now() + (safeUrl ? 600000 : 120000),
            });
          } else {
            const errorMsg =
              response.status === 409
                ? 'A conta conectada mudou. Atualize a lista.'
                : response.status === 404
                ? 'Grupo indisponível nesta conta.'
                : response.status === 502
                ? 'Foto temporariamente indisponível no provedor.'
                : typeof data?.error === 'string'
                ? data.error
                : 'Não foi possível consultar a foto.';

            setPictureUrl(null);
            setStatusMessage(errorMsg);
          }
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (isSubscribed && activeKeyRef.current === currentKey) {
          setStatusMessage('Erro ao carregar a foto.');
        }
      }
    }

    // Carregamento sob demanda com IntersectionObserver
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                observer?.disconnect();
                void fetchPhoto(false);
              }
            },
            { rootMargin: '120px' }
          );

    if (observer && containerRef.current) {
      observer.observe(containerRef.current);
    } else {
      void fetchPhoto(false);
    }

    return () => {
      isSubscribed = false;
      controller.abort();
      observer?.disconnect();
    };
  }, [connectionId, ownerJid, groupJid, personal, initialUrl, currentKey]);

  // Tratamento de falha no carregamento do elemento <img> (URL expirada no CDN)
  const handleImageError = () => {
    if (retryCountRef.current < 1 && connectionId && ownerJid) {
      retryCountRef.current += 1;
      photoClientCache.delete(currentKey);

      // Dispara consulta com refresh=1
      const controller = new AbortController();
      abortControllerRef.current = controller;

      void (async () => {
        try {
          const params = new URLSearchParams();
          if (personal) {
            params.set('account', '1');
          } else if (groupJid) {
            params.set('groupJid', groupJid);
          }
          if (connectionId) params.set('connectionId', connectionId);
          if (ownerJid) params.set('ownerJid', ownerJid);
          params.set('refresh', '1');

          const response = await fetch(`/api/whatsapp/groups/photo?${params.toString()}`, {
            signal: controller.signal,
            cache: 'no-store',
          });
          const data = await response.json();

          if (activeKeyRef.current !== currentKey) return;

          if (response.ok && data.ok && data.pictureUrl) {
            const refreshedUrl = safeWhatsAppPictureUrl(data.pictureUrl);
            if (refreshedUrl && refreshedUrl !== pictureUrl) {
              setPictureUrl(refreshedUrl);
              setStatusMessage(undefined);
              photoClientCache.set(currentKey, {
                pictureUrl: refreshedUrl,
                expires: Date.now() + 600000,
              });
              return;
            }
          }

          // Se o gateway não retornou foto nova ou retornou erro, fixa no ícone neutro
          setPictureUrl(null);
          setStatusMessage('Foto não disponível ou privada.');
        } catch {
          if (activeKeyRef.current === currentKey) {
            setPictureUrl(null);
            setStatusMessage('Foto não disponível.');
          }
        }
      })();
    } else {
      setPictureUrl(null);
      setStatusMessage('Foto não disponível.');
    }
  };

  const resolvedClassName =
    className ||
    `wa-avatar ${accountCardMode ? 'wa-avatar--account' : ''}`.trim();

  const iconSize = size || (personal && accountCardMode ? 24 : personal ? 20 : 21);

  return (
    <span
      ref={containerRef}
      title={statusMessage}
      className={resolvedClassName}
      aria-label={`Avatar de ${name}`}
    >
      {pictureUrl ? (
        <img
          src={pictureUrl}
          alt={`Foto de ${name}`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={handleImageError}
        />
      ) : personal ? (
        <UserRound size={iconSize} aria-hidden="true" />
      ) : (
        <Users size={iconSize} aria-hidden="true" />
      )}
    </span>
  );
}

