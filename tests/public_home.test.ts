import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLANS_CONFIG, SAAS_TRIAL_CONFIG } from '../src/lib/plans-config';

const ROOT = process.cwd();

test('Página Inicial Pública (/): Configuração de planos sem trial e valores alinhados à referência', () => {
  assert.equal(SAAS_TRIAL_CONFIG.enabled, false, 'Trial gratuito deve estar desativado');
  assert.equal(PLANS_CONFIG.impulse.trialDays, 0);
  assert.equal(PLANS_CONFIG.plus.trialDays, 0);
  assert.equal(PLANS_CONFIG.ultimate.trialDays, 0);

  assert.equal(PLANS_CONFIG.impulse.monthlyPrice, 29.9);
  assert.equal(PLANS_CONFIG.impulse.annualMonthlyEquivalent, 23.9);
  assert.equal(PLANS_CONFIG.impulse.annualTotalPrice, 286.8);

  assert.equal(PLANS_CONFIG.plus.monthlyPrice, 59.9);
  assert.equal(PLANS_CONFIG.plus.annualMonthlyEquivalent, 47.9);
  assert.equal(PLANS_CONFIG.plus.annualTotalPrice, 574.8);
  assert.equal(PLANS_CONFIG.plus.badge, 'Mais popular');

  assert.equal(PLANS_CONFIG.ultimate.monthlyPrice, 119.9);
  assert.equal(PLANS_CONFIG.ultimate.annualMonthlyEquivalent, 95.9);
  assert.equal(PLANS_CONFIG.ultimate.annualTotalPrice, 1150.8);
});

test('Página Inicial Pública (/): Foto real da camiseta extraída preservando os bytes originais', () => {
  const assetPath = path.join(ROOT, 'public', 'assets', 'camiseta-oversized-preta.webp');
  assert.ok(fs.existsSync(assetPath), 'Arquivo camiseta-oversized-preta.webp deve existir em public/assets');
  const stats = fs.statSync(assetPath);
  assert.equal(stats.size, 115632, 'Tamanho do arquivo WebP deve corresponder aos 115.632 bytes da referência');
});

test('Página Inicial Pública (/): Ausência de promessas de "7 dias grátis" nas rotas e componentes relacionados', () => {
  const filesToCheck = [
    'src/app/page.tsx',
    'src/app/login/page.tsx',
    'src/app/cadastro/page.tsx',
    'src/app/planos/page.tsx',
    'src/app/termos/page.tsx',
    'src/app/privacidade/page.tsx',
    'src/app/ajuda/page.tsx',
    'src/components/AppShell.tsx',
  ];

  for (const relPath of filesToCheck) {
    const content = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.ok(
      !/7\s*dias\s*gr[aá]tis/i.test(content),
      `O arquivo ${relPath} não deve conter referência a "7 dias grátis"`
    );
  }
});

test('Painel interno movido para /painel e rota / dedicada à landing pública', () => {
  const homeContent = fs.readFileSync(path.join(ROOT, 'src/app/page.tsx'), 'utf8');
  const painelContent = fs.readFileSync(path.join(ROOT, 'src/app/painel/page.tsx'), 'utf8');

  assert.ok(
    homeContent.includes('Sua marca. Suas ofertas.') && homeContent.includes('controle.'),
    'src/app/page.tsx deve conter o título aprovado da página inicial pública'
  );
  assert.ok(
    !homeContent.includes('<iframe'),
    'src/app/page.tsx não deve usar iframe'
  );
  assert.ok(
    painelContent.includes('export default function PainelPage'),
    'src/app/painel/page.tsx deve conter o painel interno'
  );
});

