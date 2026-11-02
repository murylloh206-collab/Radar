import type { CopySource, CopyDestination, WhatsAppConnection, WhatsAppGroup } from './types';

export type PublicWhatsAppConnection = Pick<WhatsAppConnection,
  'id' | 'label' | 'instanceName' | 'status' | 'ownerJid' | 'phoneNumber' | 'profileName' | 'profilePicUrl' |
  'lastVerificationStatus' | 'isDefault' | 'groupsCount' | 'lastSyncedAt'> & {
    lastPingAt: string | null;
    state: 'connected_now' | 'last_known_connection' | 'unreachable' | 'disconnected';
    statusLabel: string;
    sourcesCount?: number;
    jobsCount?: number;
  };

export interface WhatsAppWorkspace {
  ok: true;
  userId: string;
  connections: PublicWhatsAppConnection[];
  connection: PublicWhatsAppConnection | null;
  groups: WhatsAppGroup[];
  sources: CopySource[];
  destinations: CopyDestination[];
  syncedAt: string | null;
}
