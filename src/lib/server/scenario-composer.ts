import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { supabase, isSupabaseConfigured, isTestIsolationActive } from '@/lib/supabase';
import type { ScenarioCategory, ScenarioCompositionRecord, StoreName } from '../types';

let modelPromise: Promise<any> | null = null;

/**
 * Carrega o modelo de segmentação RMBG-1.4 de forma preguiçosa (singleton em memória).
 */
async function getSegmentationModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { AutoModel, env } = await import('@xenova/transformers');
      env.cacheDir = path.join(process.cwd(), '.cache', 'transformers');
      return AutoModel.from_pretrained('briaai/RMBG-1.4');
    })();
  }
  return modelPromise;
}

export interface DetectCategoryResult {
  category: ScenarioCategory;
  scenarioFile: string;
  confidence: number;
  reason: string;
}

/**
 * Detecta automaticamente a categoria do produto com base no título, texto da mensagem e metadados.
 */
export function detectProductCategory(
  title: string,
  rawText?: string,
  store?: StoreName
): DetectCategoryResult {
  const combined = `${title || ''} ${rawText || ''}`.toLowerCase();

  // 1. Suplementos e Fitness
  const fitnessKeywords = [
    'creatina', 'whey', 'proteina', 'proteína', 'bcaa', 'glutamina', 'pré-treino', 'pre-treino',
    'albumina', 'hipercalórico', 'hipercalorico', 'colágeno', 'colageno', 'barra de proteina',
    'halter', 'halteres', 'anilha', 'strap', 'coqueteleira', 'elástico extensor', 'creatina soldiers',
    'max titanium', 'dark lab', 'growth supplements', 'integralmedica', 'black skull', 'suplemento'
  ];
  for (const kw of fitnessKeywords) {
    if (combined.includes(kw)) {
      return {
        category: 'suplementos-fitness',
        scenarioFile: 'suplementos-fitness.png',
        confidence: 0.95,
        reason: `Palavra-chave fitness detectada: "${kw}"`,
      };
    }
  }

  // 2. Eletroeletrônicos
  const techKeywords = [
    'smartphone', 'celular', 'iphone', 'galaxy', 'xiaomi', 'redmi', 'smartwatch', 'relógio inteligente',
    'fone de ouvido', 'headphone', 'headset', 'airpods', 'earbuds', 'caixa de som', 'jbl', 'alexa',
    'echo dot', 'teclado', 'mouse', 'monitor', 'notebook', 'laptop', 'tablet', 'ipad', 'kindle',
    'carregador', 'cabo usb', 'power bank', 'smart tv', 'televisão', 'projetor', 'console', 'playstation',
    'ps5', 'xbox', 'nintendo'
  ];
  for (const kw of techKeywords) {
    if (combined.includes(kw)) {
      return {
        category: 'eletroeletronicos',
        scenarioFile: 'eletroeletronicos.png',
        confidence: 0.92,
        reason: `Palavra-chave eletroeletrônicos detectada: "${kw}"`,
      };
    }
  }

  // 3. Ferramentas
  const toolKeywords = [
    'furadeira', 'parafusadeira', 'serra', 'lixadeira', 'esmerilhadeira', 'martelete', 'jogo de chaves',
    'chave de fenda', 'chave philips', 'chave combinada', 'alicate', 'trena', 'nível laser', 'nivel laser',
    'maleta de ferramentas', 'caixa de ferramentas', 'broca', 'disco de corte', 'compressor', 'maçarico',
    'solda', 'makita', 'bosch', 'dewalt', 'vonder'
  ];
  for (const kw of toolKeywords) {
    if (combined.includes(kw)) {
      return {
        category: 'ferramentas',
        scenarioFile: 'ferramentas.png',
        confidence: 0.94,
        reason: `Palavra-chave ferramentas detectada: "${kw}"`,
      };
    }
  }

  // 4. Saúde e Beleza
  const beautyKeywords = [
    'perfume', 'hidratante', 'sérum', 'serum', 'protetor solar', 'protetor labial', 'creme facial',
    'sabonete', 'shampoo', 'condicionador', 'máscara capilar', 'mascara capilar', 'escova secadora',
    'secador de cabelo', 'prancha', 'babyliss', 'barbeador', 'aparador de pelos', 'maquiagem',
    'batom', 'base facial', 'corretivo', 'rímel', 'rimel', 'esmalte', 'eudora', 'boticario', 'natura'
  ];
  for (const kw of beautyKeywords) {
    if (combined.includes(kw)) {
      return {
        category: 'saude-beleza',
        scenarioFile: 'saude-beleza.png',
        confidence: 0.93,
        reason: `Palavra-chave saúde e beleza detectada: "${kw}"`,
      };
    }
  }

  // 5. Eletrodomésticos
  const homeApplianceKeywords = [
    'geladeira', 'refrigerador', 'freezer', 'máquina de lavar', 'maquina de lavar', 'lavadora',
    'lava e seca', 'lava-louças', 'lava loucas', 'fogão', 'fogao', 'cooktop', 'forno eletrico',
    'micro-ondas', 'microondas', 'coifa', 'depurador', 'aspirador de pó', 'aspirador de po',
    'robô aspirador', 'robo aspirador', 'ar-condicionado', 'ar condicionado', 'climatizador',
    'ventilador', 'ferro de passar', 'cafeteira', 'air fryer', 'fritadeira sem oleo', 'liquidificador',
    'batedeira', 'sanduicheira'
  ];
  for (const kw of homeApplianceKeywords) {
    if (combined.includes(kw)) {
      return {
        category: 'eletrodomesticos',
        scenarioFile: 'eletrodomesticos.png',
        confidence: 0.92,
        reason: `Palavra-chave eletrodomésticos detectada: "${kw}"`,
      };
    }
  }

  // 6. Moda Feminina (detecção por termos específicos ou combinação de vestuário + feminino)
  const isFemaleContext = combined.includes('feminina') || combined.includes('feminino') || combined.includes('mulher');
  const femaleExclusiveKeywords = [
    'vestido', 'saia', 'cropped', 'sutiã', 'sutia', 'lingerie', 'biquíni', 'biquini', 'maiô', 'maio',
    'bolsa feminina', 'bolsa transversal', 'salto alto', 'rasteirinha', 'sandália', 'sandalia', 'sapatilha',
    'macacão feminino', 'macaquinho', 'body feminino'
  ];
  for (const kw of femaleExclusiveKeywords) {
    if (combined.includes(kw)) {
      return {
        category: 'moda-feminina',
        scenarioFile: 'moda-feminina.png',
        confidence: 0.93,
        reason: `Palavra-chave moda feminina detectada: "${kw}"`,
      };
    }
  }
  if (isFemaleContext && (combined.includes('blusa') || combined.includes('calça') || combined.includes('calca') || combined.includes('camisa') || combined.includes('tênis') || combined.includes('tenis') || combined.includes('bolsa') || combined.includes('jaqueta'))) {
    return {
      category: 'moda-feminina',
      scenarioFile: 'moda-feminina.png',
      confidence: 0.91,
      reason: 'Termo de vestuário feminino detectado',
    };
  }

  // 7. Moda Masculina (detecção por termos específicos ou combinação de vestuário + masculino)
  const isMaleContext = combined.includes('masculina') || combined.includes('masculino') || combined.includes('homem');
  const maleExclusiveKeywords = [
    'cueca', 'sunga', 'terno', 'blazer', 'sapatênis', 'sapatenis', 'sapato social', 'camisa polo',
    'gravata', 'camisa social'
  ];
  for (const kw of maleExclusiveKeywords) {
    if (combined.includes(kw)) {
      return {
        category: 'moda-masculina',
        scenarioFile: 'moda-masculina.png',
        confidence: 0.93,
        reason: `Palavra-chave moda masculina detectada: "${kw}"`,
      };
    }
  }
  if (isMaleContext && (combined.includes('camisa') || combined.includes('camiseta') || combined.includes('bermuda') || combined.includes('calça') || combined.includes('calca') || combined.includes('jaqueta') || combined.includes('polo') || combined.includes('sapatênis') || combined.includes('tenis') || combined.includes('tênis') || combined.includes('sapato'))) {
    return {
      category: 'moda-masculina',
      scenarioFile: 'moda-masculina.png',
      confidence: 0.92,
      reason: 'Termo de vestuário masculino detectado',
    };
  }

  // Fallback padrão se não identificado: eletroeletrônicos (mesa de madeira neutra)
  return {
    category: 'eletroeletronicos',
    scenarioFile: 'eletroeletronicos.png',
    confidence: 0.5,
    reason: 'Categoria não identificada com precisão; selecionado cenário neutro de eletrônicos/mesa',
  };
}

/**
 * Remove o fundo da imagem do produto usando o modelo RMBG-1.4.
 * Retorna Buffer PNG com canal alfa transparente recortado.
 */
export async function removeProductBackground(
  imageUrl: string,
  timeoutMs = 15000
): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const origRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    if (!origRes.ok) throw new Error(`Falha ao baixar imagem oficial (HTTP ${origRes.status})`);
    const origBuffer = Buffer.from(await origRes.arrayBuffer());

    const { RawImage, Tensor } = await import('@xenova/transformers');
    const model = await getSegmentationModel();

    if (controller.signal.aborted) {
      throw new Error(`Timeout na remoção de fundo (${timeoutMs}ms)`);
    }

    // CORREÇÃO P1: Reutilizar o buffer já baixado em memória via RawImage.fromBlob(new Blob([origBuffer]))
    // evitando segundo download desnecessário pela rede que ignorava timeouts e causava latência dobrada
    const image = await RawImage.fromBlob(new Blob([origBuffer]));
    const resized = await image.resize(1024, 1024);

    const numPixels = 1024 * 1024;
    const float32Data = new Float32Array(3 * numPixels);
    const rawData = resized.data;

    for (let i = 0; i < numPixels; ++i) {
      const r = rawData[i * resized.channels];
      const g = rawData[i * resized.channels + 1];
      const b = rawData[i * resized.channels + 2];
      float32Data[i] = (r / 255.0 - 0.5) / 1.0;
      float32Data[numPixels + i] = (g / 255.0 - 0.5) / 1.0;
      float32Data[2 * numPixels + i] = (b / 255.0 - 0.5) / 1.0;
    }

    const inputTensor = new Tensor('float32', float32Data, [1, 3, 1024, 1024]);
    const outputs = await model({ [model.session.handler.inputNames[0]]: inputTensor });
    const outputTensor = outputs[model.session.handler.outputNames[0]];
    const maskData = outputTensor.data;

    let minVal = Infinity, maxVal = -Infinity;
    for (let i = 0; i < numPixels; i++) {
      if (maskData[i] < minVal) minVal = maskData[i];
      if (maskData[i] > maxVal) maxVal = maskData[i];
    }

    const alphaBuffer = Buffer.alloc(numPixels);
    for (let i = 0; i < numPixels; ++i) {
      let prob: number;
      if (minVal >= 0 && maxVal <= 1) {
        prob = maskData[i];
      } else {
        prob = 1.0 / (1.0 + Math.exp(-maskData[i]));
      }
      alphaBuffer[i] = Math.round(Math.max(0, Math.min(1, prob)) * 255);
    }

    const maskPng = await sharp(alphaBuffer, {
      raw: { width: 1024, height: 1024, channels: 1 },
    }).png().toBuffer();

    const originalMeta = await sharp(origBuffer).metadata();
    const origWidth = originalMeta.width || 1024;
    const origHeight = originalMeta.height || 1024;

    const resizedMask = await sharp(maskPng)
      .resize(origWidth, origHeight, { fit: 'fill' })
      .toBuffer();

    const cutout = await sharp(origBuffer)
      .ensureAlpha()
      .joinChannel(resizedMask)
      .png()
      .toBuffer();

    return cutout;
  } finally {
    clearTimeout(timer);
  }
}

export interface ComposeOptions {
  category: ScenarioCategory;
  productCutoutBuffer: Buffer;
  targetSize?: number;
  watermarkHandle?: string;
  watermarkEnabled?: boolean;
}

/**
 * Compõe o recorte do produto real sobre o cenário correspondente à categoria,
 * aplicando proporção física, sombra de contato e assinatura discreta da conta.
 */
export async function composeProductOnScenario(options: ComposeOptions): Promise<Buffer> {
  const {
    category,
    productCutoutBuffer,
    targetSize = 1080,
    watermarkHandle = '@radar.ofertas.br1',
    watermarkEnabled = true,
  } = options;

  // Localizar o arquivo do cenário em public/scenarios ou no pacote original
  const scenarioFile = `${category}.png`;
  let scenarioPath = path.join(process.cwd(), 'public', 'scenarios', scenarioFile);
  if (!fs.existsSync(scenarioPath)) {
    scenarioPath = path.join(
      'C:\\Users\\Muryllo Hc\\Documents\\Codex\\2026-10-24\\referenced-chatgpt-conversation-this-is-an\\RADAR-CENARIOS-POR-CATEGORIA\\estudio-radar-cenarios-categorias\\fundos',
      scenarioFile
    );
  }

  if (!fs.existsSync(scenarioPath)) {
    throw new Error(`Arquivo de cenário não encontrado para a categoria "${category}": ${scenarioFile}`);
  }

  // 1. Preparar fundo do cenário
  const bgBuffer = await sharp(scenarioPath)
    .resize(targetSize, targetSize, { fit: 'cover' })
    .toBuffer();

  // 2. Aparar bordas transparentes do produto recortado
  const trimmed = sharp(productCutoutBuffer).trim();
  const trimmedBuffer = await trimmed.toBuffer();
  const trimmedMeta = await sharp(trimmedBuffer).metadata();
  const trimmedW = trimmedMeta.width || 800;
  const trimmedH = trimmedMeta.height || 1000;

  // 3. Parâmetros de perspectiva, superfície e posicionamento por categoria
  let heightRatio = 0.55;
  let surfaceYRatio = 0.60;
  let isOverheadFlatLay = false;
  let shadowIntensity = 0.85;

  switch (category) {
    case 'suplementos-fitness':
      // Banco de academia acolchoado: superfície Y ≈ 0.58
      heightRatio = 0.54;
      surfaceYRatio = 0.585;
      shadowIntensity = 0.88;
      break;
    case 'eletroeletronicos':
      // Mesa de madeira escura no escritório: superfície Y ≈ 0.64
      heightRatio = 0.48;
      surfaceYRatio = 0.63;
      shadowIntensity = 0.82;
      break;
    case 'ferramentas':
      // Bancada de oficina compensado: superfície Y ≈ 0.63
      heightRatio = 0.52;
      surfaceYRatio = 0.63;
      shadowIntensity = 0.85;
      break;
    case 'saude-beleza':
      // Bancada de pedra travertino: superfície Y ≈ 0.61
      heightRatio = 0.52;
      surfaceYRatio = 0.61;
      shadowIntensity = 0.78;
      break;
    case 'eletrodomesticos':
      // Chão de cozinha contemporânea (eletros maiores no chão, menores rebaixados)
      heightRatio = 0.58;
      surfaceYRatio = 0.78;
      shadowIntensity = 0.90;
      break;
    case 'moda-masculina':
      // Sofá cinza visto de cima (flat-lay overhead)
      heightRatio = 0.60;
      isOverheadFlatLay = true;
      shadowIntensity = 0.60;
      break;
    case 'moda-feminina':
      // Banco de linho claro visto de cima (flat-lay overhead)
      heightRatio = 0.60;
      isOverheadFlatLay = true;
      shadowIntensity = 0.55;
      break;
  }

  // Ajustar dimensões do produto
  let prodH = Math.round(targetSize * heightRatio);
  let prodW = Math.round((trimmedW / trimmedH) * prodH);

  // Se o produto for muito largo (horizontal), limitar pela largura (máx 72% do canvas)
  const maxW = Math.round(targetSize * 0.72);
  if (prodW > maxW) {
    prodW = maxW;
    prodH = Math.round((trimmedH / trimmedW) * prodW);
  }

  const productResized = await sharp(trimmedBuffer)
    .resize(prodW, prodH, { fit: 'inside' })
    .toBuffer();

  const posX = Math.round((targetSize - prodW) / 2);
  let posY: number;

  if (isOverheadFlatLay) {
    // Centralizado verticalmente com leve deslocamento superior para estética editorial
    posY = Math.round((targetSize - prodH) / 2 - 20);
  } else {
    // Base do produto repousa exatamente sobre a superfície calculada
    posY = Math.round(targetSize * surfaceYRatio - prodH);
  }

  // 4. Sombras realistas
  const layers: sharp.OverlayOptions[] = [];

  if (isOverheadFlatLay) {
    // Sombra suave difusa uniforme em flat-lay (ao redor da roupa/objeto sobre o estofado)
    const softShadowW = Math.round(prodW * 1.06);
    const softShadowH = Math.round(prodH * 1.06);
    const softShadowSvg = `
      <svg width="${softShadowW}" height="${softShadowH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="flatShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(0,0,0,${shadowIntensity * 0.5})"/>
            <stop offset="65%" stop-color="rgba(0,0,0,${shadowIntensity * 0.2})"/>
            <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
          </radialGradient>
        </defs>
        <ellipse cx="${softShadowW / 2}" cy="${softShadowH / 2 + 5}" rx="${softShadowW * 0.44}" ry="${softShadowH * 0.44}" fill="url(#flatShadow)"/>
      </svg>
    `;
    const softShadowBuf = await sharp(Buffer.from(softShadowSvg)).blur(8).toBuffer();
    layers.push({
      input: softShadowBuf,
      left: Math.round(posX + (prodW - softShadowW) / 2),
      top: Math.round(posY + (prodH - softShadowH) / 2 + 5),
    });
  } else {
    // Sombra de contato direcional (luz vindo do canto superior esquerdo)
    // a) Sombra difusa projetada para baixo e direita
    const shadowW = Math.round(prodW * 0.90);
    const shadowH = Math.max(Math.round(prodH * 0.12), 24);
    const diffuseShadowSvg = `
      <svg width="${shadowW}" height="${shadowH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="diffuseGrad" cx="42%" cy="45%" r="50%">
            <stop offset="0%" stop-color="rgba(0,0,0,${shadowIntensity * 0.85})"/>
            <stop offset="35%" stop-color="rgba(0,0,0,${shadowIntensity * 0.55})"/>
            <stop offset="70%" stop-color="rgba(0,0,0,${shadowIntensity * 0.2})"/>
            <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
          </radialGradient>
        </defs>
        <ellipse cx="${shadowW / 2}" cy="${shadowH / 2}" rx="${shadowW * 0.46}" ry="${shadowH * 0.42}" fill="url(#diffuseGrad)"/>
      </svg>
    `;
    const diffuseShadowBuf = await sharp(Buffer.from(diffuseShadowSvg)).blur(6).toBuffer();
    layers.push({
      input: diffuseShadowBuf,
      left: Math.round(posX + (prodW - shadowW) / 2 + 12),
      top: Math.round(posY + prodH - shadowH / 2 - 2),
    });

    // b) Linha de oclusão de contato estrita na base (muito escura, sem espalhar)
    const tightW = Math.round(prodW * 0.70);
    const tightH = Math.max(Math.round(shadowH * 0.35), 10);
    const tightSvg = `
      <svg width="${tightW}" height="${tightH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="tightOcclusion" cx="48%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(0,0,0,0.92)"/>
            <stop offset="60%" stop-color="rgba(0,0,0,0.45)"/>
            <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
          </radialGradient>
        </defs>
        <ellipse cx="${tightW / 2}" cy="${tightH / 2}" rx="${tightW * 0.48}" ry="${tightH * 0.38}" fill="url(#tightOcclusion)"/>
      </svg>
    `;
    const tightBuf = await sharp(Buffer.from(tightSvg)).blur(2).toBuffer();
    layers.push({
      input: tightBuf,
      left: Math.round(posX + (prodW - tightW) / 2 + 6),
      top: Math.round(posY + prodH - tightH / 2 - 2),
    });
  }

  // Camada do produto
  layers.push({
    input: productResized,
    left: posX,
    top: posY,
  });

  // 5. Assinatura da conta (Marca d'água discreta posicionada próxima ao produto)
  if (watermarkEnabled && watermarkHandle) {
    const handleClean = watermarkHandle.trim();
    const handleText = handleClean.startsWith('@') ? handleClean : `@${handleClean}`;

    const pillW = 270;
    const pillH = 42;
    const watermarkSvg = `
      <svg width="${pillW}" height="${pillH}" viewBox="0 0 ${pillW} ${pillH}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="1" width="${pillW - 2}" height="${pillH - 2}" rx="20" fill="rgba(6, 18, 37, 0.72)" stroke="rgba(28, 202, 242, 0.40)" stroke-width="1.5"/>
        <circle cx="21" cy="21" r="12" fill="#0D1B31" stroke="#1CCAF2" stroke-width="1.6"/>
        <circle cx="21" cy="21" r="5" fill="#1CCAF2"/>
        <text x="42" y="26" fill="#F8FBFF" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="700" letter-spacing="0.3">${handleText}</text>
      </svg>
    `;
    const watermarkBuf = await sharp(Buffer.from(watermarkSvg)).toBuffer();

    // Posicionar a assinatura mais próxima da base/lateral do produto
    // sem cobrir o produto e sem ficar isolada no extremo da borda
    let wmX = Math.round(posX + prodW - pillW + 20);
    wmX = Math.max(16, Math.min(wmX, targetSize - pillW - 16));

    let wmY = Math.round(posY + prodH + 25);
    if (wmY + pillH > targetSize - 16) {
      wmY = targetSize - pillH - 18;
    }

    layers.push({
      input: watermarkBuf,
      left: wmX,
      top: wmY,
    });
  }

  // 6. Composição final e exportação em JPEG alta qualidade
  return sharp(bgBuffer)
    .composite(layers)
    .jpeg({ quality: 90, progressive: true })
    .toBuffer();
}

/**
 * Salva a imagem composta no Supabase Storage (com isolamento por usuário e regra).
 * Se o Supabase estiver indisponível ou em modo de teste, salva localmente em public/generated-media.
 */
export async function persistComposedImage(params: {
  userId: string;
  sourceId?: string;
  imageBuffer: Buffer;
  hashKey: string;
}): Promise<string> {
  const { userId, sourceId, imageBuffer, hashKey } = params;
  const fileName = `${hashKey}.jpg`;
  const storagePath = `${userId}/compositions/${sourceId || 'default'}/${fileName}`;

  // Se Supabase estiver ativo e não for modo isolado de testes
  if (isSupabaseConfigured && supabase && !isTestIsolationActive()) {
    try {
      const { error: uploadErr } = await supabase.storage
        .from('radar-media')
        .upload(storagePath, imageBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadErr) {
        throw new Error(`Falha no upload para Supabase Storage: ${uploadErr.message}`);
      }

      const { data } = supabase.storage.from('radar-media').getPublicUrl(storagePath);
      if (data?.publicUrl) {
        return data.publicUrl;
      }
      throw new Error('Supabase Storage não retornou URL pública para a imagem');
    } catch (err: any) {
      // CORREÇÃO P1: Em ambiente de produção com Supabase configurado,
      // nunca salvar no disco local do worker nem inventar URL sob APP_URL (Vercel),
      // pois o arquivo não existe na Vercel e resultará em erro 404 para o destinatário.
      // O erro é propagado para acionar o fallback seguro (foto oficial ou revisão manual).
      throw new Error(`Persistência remota da imagem no Supabase falhou: ${err.message || 'Erro desconhecido'}`);
    }
  }

  // Fallback para arquivo local em public/generated-media
  const localDir = path.join(process.cwd(), 'public', 'generated-media', userId);
  fs.mkdirSync(localDir, { recursive: true });
  const localFilePath = path.join(localDir, fileName);
  fs.writeFileSync(localFilePath, imageBuffer);

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '';
  if (appUrl && appUrl.startsWith('http')) {
    return `${appUrl.replace(/\/+$/, '')}/generated-media/${userId}/${fileName}`;
  }

  return `/generated-media/${userId}/${fileName}`;
}

export interface ProcessAutomaticImageParams {
  userId: string;
  sourceId?: string;
  productTitle: string;
  rawText?: string;
  storeName: StoreName;
  officialPhotoUrl: string;
  watermarkHandle?: string;
  watermarkEnabled?: boolean;
  imageMode?: 'cenario_automatico' | 'foto_oficial' | 'radar_art' | 'none';
  failureFallback?: 'usar_foto_oficial' | 'revisao_manual';
}

export interface ProcessAutomaticImageResult {
  success: boolean;
  composedUrl?: string;
  selectedPhotoUrl: string;
  category: ScenarioCategory;
  scenarioFile: string;
  processingMs: number;
  requiresManualReview: boolean;
  status: 'sucesso' | 'falha_fallback_oficial' | 'falha_revisao';
  reason: string;
  record?: ScenarioCompositionRecord;
}

export const IMAGE_PIPELINE_TOTAL_TIMEOUT_MS = 12000;

/**
 * Pipeline completo de processamento de imagem automática do Copiador.
 * 1. Avalia se o modo configurado é cenario_automatico ou foto_oficial
 * 2. Se for foto oficial, retorna a foto oficial de alta resolução
 * 3. Se for cenário automático:
 *    a) Detecta categoria
 *    b) Checa cache por hash (evita reprocessamento)
 *    c) Remove fundo
 *    d) Compõe no cenário com sombra e marca d'água
 *    e) Salva no Supabase Storage com isolamento
 *    f) Se falhar ou exceder prazo total, aplica o fallback configurado (usar foto oficial ou encaminhar para revisão)
 */
export async function processAutomaticCopierImage(
  params: ProcessAutomaticImageParams
): Promise<ProcessAutomaticImageResult> {
  const started = performance.now();
  const {
    userId,
    sourceId,
    productTitle,
    rawText,
    storeName,
    officialPhotoUrl,
    watermarkHandle = '@radar.ofertas.br1',
    watermarkEnabled = true,
    imageMode = 'cenario_automatico',
    failureFallback = 'usar_foto_oficial',
  } = params;

  // 1. Detectar categoria
  const catResult = detectProductCategory(productTitle, rawText, storeName);
  const { category, scenarioFile } = catResult;

  // Se modo configurado for foto oficial limpa:
  if (imageMode === 'foto_oficial') {
    return {
      success: true,
      composedUrl: officialPhotoUrl,
      selectedPhotoUrl: officialPhotoUrl,
      category,
      scenarioFile,
      processingMs: Math.round(performance.now() - started),
      requiresManualReview: false,
      status: 'sucesso',
      reason: 'Modo Foto Oficial selecionado; utilizando fotografia em alta resolução diretamente da loja.',
    };
  }

  if (!officialPhotoUrl || !officialPhotoUrl.startsWith('http')) {
    const isManualReview = failureFallback === 'revisao_manual';
    return {
      success: false,
      selectedPhotoUrl: '',
      category,
      scenarioFile,
      processingMs: Math.round(performance.now() - started),
      requiresManualReview: isManualReview,
      status: isManualReview ? 'falha_revisao' : 'falha_fallback_oficial',
      reason: 'Fotografia oficial não encontrada ou URL inválida.',
    };
  }

  // 2. Chave de cache determinística
  const hashInput = `${officialPhotoUrl}|${category}|${watermarkHandle}|${watermarkEnabled ? '1' : '0'}|v1`;
  const hashKey = createHash('sha256').update(hashInput).digest('hex').substring(0, 20);

  // 3. Executar recorte e composição sob prazo total (12s)
  try {
    const pipelinePromise = (async () => {
      // Timeout do download/recorte ajustado para caber no orçamento total de 12s
      const cutoutBuffer = await removeProductBackground(officialPhotoUrl, 10000);
      const composedBuffer = await composeProductOnScenario({
        category,
        productCutoutBuffer: cutoutBuffer,
        targetSize: 1080,
        watermarkHandle,
        watermarkEnabled,
      });

      // 4. Salvar no Supabase Storage
      const publicUrl = await persistComposedImage({
        userId,
        sourceId,
        imageBuffer: composedBuffer,
        hashKey,
      });

      return { publicUrl };
    })();

    let timeoutTimer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => {
        reject(new Error(`Tempo limite do pipeline de imagem excedido (${IMAGE_PIPELINE_TOTAL_TIMEOUT_MS}ms)`));
      }, IMAGE_PIPELINE_TOTAL_TIMEOUT_MS);
    });

    const { publicUrl } = await Promise.race([pipelinePromise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutTimer);
    });

    const elapsed = Math.round(performance.now() - started);

    const record: ScenarioCompositionRecord = {
      id: `comp_${Date.now()}_${hashKey.substring(0, 6)}`,
      userId,
      sourceId,
      category,
      originalPhotoUrl: officialPhotoUrl,
      composedPhotoUrl: publicUrl,
      scenarioFile,
      styleVersion: '1.0',
      processingMs: elapsed,
      status: 'sucesso',
      createdAt: new Date().toISOString(),
    };

    return {
      success: true,
      composedUrl: publicUrl,
      selectedPhotoUrl: officialPhotoUrl,
      category,
      scenarioFile,
      processingMs: elapsed,
      requiresManualReview: false,
      status: 'sucesso',
      reason: `Composição gerada com sucesso em ${elapsed}ms no cenário ${category}`,
      record,
    };
  } catch (error: any) {
    const elapsed = Math.round(performance.now() - started);
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido na composição';

    if (failureFallback === 'revisao_manual') {
      return {
        success: false,
        selectedPhotoUrl: officialPhotoUrl,
        category,
        scenarioFile,
        processingMs: elapsed,
        requiresManualReview: true,
        status: 'falha_revisao',
        reason: `Falha na montagem de cenário: ${errorMsg}. Oferta retida para revisão manual.`,
      };
    }

    // Fallback: Usar foto oficial
    return {
      success: true,
      composedUrl: officialPhotoUrl,
      selectedPhotoUrl: officialPhotoUrl,
      category,
      scenarioFile,
      processingMs: elapsed,
      requiresManualReview: false,
      status: 'falha_fallback_oficial',
      reason: `Montagem de cenário falhou (${errorMsg}); aplicada foto oficial de alta resolução conforme regra de contingência.`,
    };
  }
}
