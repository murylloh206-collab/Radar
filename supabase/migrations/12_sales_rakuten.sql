-- Vendas da Netshoes pela API oficial da Rakuten (avisos de venda no celular do dono).
alter table public.converted_sales drop constraint if exists converted_sales_data_source_check;
alter table public.converted_sales
  add constraint converted_sales_data_source_check
  check (data_source in ('api_oficial_shopee', 'api_oficial_rakuten', 'csv_importado'));
