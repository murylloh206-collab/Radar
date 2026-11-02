import sharp from 'sharp';
import crypto from 'node:crypto';
import { supabase } from '../supabase';

/**
 * Otimiza a foto oficial do produto para exibição perfeita no WhatsApp.
 * - Formato: 1080x1080 (proporção quadrada 1:1, padrão do balão de mensagem do WhatsApp).
 * - Fundo limpo (branco puro #FFFFFF de e-commerce), sem cortes em partes do produto.
 * - Margem de segurança de 6% (máximo 960x960 no centro) para evitar que cantos arredondados do WhatsApp cortem a imagem.
 * - Exportação em JPEG progressivo com alta qualidade (92), sem perda visual.
 * - O usuário no WhatsApp visualiza o produto inteiro diretamente na conversa, sem precisar abrir a foto.
 */
export async function optimizeProductImageForWhatsApp(
  imageUrl: string | undefined,
  userId: string = '00000000-0000-0000-0000-000000000001'
): Promise<string | undefined> {
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return imageUrl;
  }

  const timeoutPromise = new Promise<string>((resolve) => {
    setTimeout(() => resolve(imageUrl), 5000);
  });

  const processPromise = (async (): Promise<string> => {
    try {
      const controller = new AbortController();
      const fetchTimer = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        signal: controller.signal,
      });
      clearTimeout(fetchTimer);

      if (!res.ok) {
        return imageUrl;
      }

      const inputBuffer = Buffer.from(await res.arrayBuffer());

      // Redimensionar para caber dentro da área útil (960x960) mantendo a proporção original
      const innerBuffer = await sharp(inputBuffer)
        .resize(960, 960, {
          fit: 'inside',
          withoutEnlargement: false,
        })
        .toBuffer();

      // Montar sobre tela quadrada 1080x1080 com fundo branco limpo
      const squareBuffer = await sharp({
        create: {
          width: 1080,
          height: 1080,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .composite([{ input: innerBuffer, gravity: 'centre' }])
        .jpeg({
          quality: 92,
          chromaSubsampling: '4:2:0',
          progressive: true,
        })
        .toBuffer();

      // Upload para o Supabase Storage (se disponível)
      if (supabase) {
        const hash = crypto.createHash('sha256').update(imageUrl).digest('hex').slice(0, 20);
        const storagePath = `${userId}/clean-products/${hash}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('radar-media')
          .upload(storagePath, squareBuffer, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (!uploadError) {
          const { data } = supabase.storage.from('radar-media').getPublicUrl(storagePath);
          if (data?.publicUrl) {
            return data.publicUrl;
          }
        }
      }

      return imageUrl;
    } catch {
      return imageUrl;
    }
  })();

  return Promise.race([processPromise, timeoutPromise]);
}

