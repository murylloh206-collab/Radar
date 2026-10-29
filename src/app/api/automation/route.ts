import { NextRequest, NextResponse } from 'next/server';
import { readDatabase, writeDatabase } from '@/lib/server/storage';
import { CuratorPlan, ListCampaign, QueueCampaign } from '@/lib/types';

export async function GET() {
  try {
    const db = readDatabase();
    return NextResponse.json({
      ok: true,
      queueCampaigns: db.queueCampaigns || [],
      listCampaigns: db.listCampaigns || [],
      curatorPlans: db.curatorPlans || (db as any).curatorPlans || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, queueData, listData, curatorData } = body;
    const db = readDatabase();

    if (action === 'save_queue' && queueData) {
      const existingIdx = db.queueCampaigns.findIndex((q) => q.id === queueData.id);
      const queueCampaign: QueueCampaign = {
        id: queueData.id || `queue_${Date.now()}`,
        userId: db.settings.userId,
        name: queueData.name || 'Fila Padrão de Garimpo',
        storeName: queueData.storeName || 'shopee',
        niches: queueData.niches || ['tecnologia', 'achadinhos'],
        targetJids: queueData.targetJids || [],
        minPrice: queueData.minPrice,
        maxPrice: queueData.maxPrice,
        minRating: queueData.minRating ?? 4.5,
        minReviews: queueData.minReviews ?? 10,
        minSales: queueData.minSales ?? 5,
        minCommission: queueData.minCommission ?? 2.0,
        sendIntervalMinutes: queueData.sendIntervalMinutes ?? 45,
        windowStart: queueData.windowStart || '08:00:00',
        windowEnd: queueData.windowEnd || '22:00:00',
        nightPause: queueData.nightPause ?? true,
        diversityMode: queueData.diversityMode || 'moderate',
        repeatAfterDays: queueData.repeatAfterDays ?? 15,
        isActive: queueData.isActive ?? true,
        updatedAt: new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        db.queueCampaigns[existingIdx] = queueCampaign;
      } else {
        db.queueCampaigns.unshift(queueCampaign);
      }

      writeDatabase(db);
      return NextResponse.json({ ok: true, queueCampaign });
    }

    if (action === 'save_list' && listData) {
      const existingIdx = db.listCampaigns.findIndex((l) => l.id === listData.id);
      const listCampaign: ListCampaign = {
        id: listData.id || `list_${Date.now()}`,
        userId: db.settings.userId,
        name: listData.name || 'Lista de Disparos em Lote',
        targetJids: listData.targetJids || [],
        intervalMinutes: listData.intervalMinutes ?? 30,
        scheduledStart: listData.scheduledStart || new Date().toISOString(),
        items: listData.items || [],
        totalItems: (listData.items || []).length,
        sentItems: listData.sentItems ?? 0,
        status: listData.status || 'ativa',
        updatedAt: new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        db.listCampaigns[existingIdx] = listCampaign;
      } else {
        db.listCampaigns.unshift(listCampaign);
      }

      writeDatabase(db);
      return NextResponse.json({ ok: true, listCampaign });
    }

    if (action === 'save_curator' && curatorData) {
      if (!(db as any).curatorPlans) {
        (db as any).curatorPlans = [];
      }
      const plans = (db as any).curatorPlans as CuratorPlan[];
      const existingIdx = plans.findIndex((c) => c.id === curatorData.id);

      const curatorPlan: CuratorPlan = {
        id: curatorData.id || `curator_${Date.now()}`,
        userId: db.settings.userId,
        name: curatorData.name || 'Curador Estratégico',
        audienceProfile: curatorData.audienceProfile || '',
        criteria: curatorData.criteria || {},
        selectedStores: curatorData.selectedStores || ['shopee', 'mercadolivre', 'netshoes'],
        targetJids: curatorData.targetJids || [],
        dailyOffersLimit: curatorData.dailyOffersLimit ?? 20,
        scheduleMode: curatorData.scheduleMode || 'ia',
        timeslots: curatorData.timeslots || ['09:00:00', '12:00:00', '15:00:00', '18:00:00', '21:00:00'],
        isActive: curatorData.isActive ?? true,
        updatedAt: new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        plans[existingIdx] = curatorPlan;
      } else {
        plans.unshift(curatorPlan);
      }

      writeDatabase(db);
      return NextResponse.json({ ok: true, curatorPlan });
    }

    return NextResponse.json({ ok: false, error: 'Ação não reconhecida' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
