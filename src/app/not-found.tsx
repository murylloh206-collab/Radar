import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0c0c0d] flex flex-col items-center justify-center p-6 text-center">
      <div className="p-8 rounded-3xl bg-[#161616] border border-[#2c2c2c] max-w-md w-full space-y-4">
        <span className="text-4xl font-black text-[#f5c542]">404</span>
        <h1 className="text-lg font-bold text-[#f6f2e8]">Página Não Encontrada</h1>
        <p className="text-xs text-[#a8a39a]">
          O recurso ou página solicitada não foi encontrada no Radar de Ofertas.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#d9a520] to-[#f5c542] text-[#0c0c0d] font-bold text-xs shadow-md"
        >
          Voltar para o Início
        </Link>
      </div>
    </div>
  );
}

