import 'server-only';
import { UserSettingRepository } from './repository';
import { UserSettingService } from './service';
import { db } from '@/lib/db';

export const userSettingRepository = new UserSettingRepository(db);
export const userSettingService = new UserSettingService(userSettingRepository);
