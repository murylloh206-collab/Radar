import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#061225] flex flex-col items-center justify-center p-6 text-center">
      <div className="p-8 rounded-3xl bg-[#0D1B31] border border-[#18334D] max-w-md w-full space-y-4">
        <span className="text-4xl font-black text-[#1CCAF2]">404</span>
        <h1 className="text-lg font-bold text-[#F8FBFF]">Página Não Encontrada</h1>
        <p className="text-xs text-[#8EADC7]">
          O recurso ou página solicitada não foi encontrada no Radar de Ofertas.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] font-bold text-xs shadow-md"
        >
          Voltar para o Início
        </Link>
      </div>
    </div>
  );
}

