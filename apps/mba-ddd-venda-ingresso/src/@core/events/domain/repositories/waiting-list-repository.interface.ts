import { IRepository } from '../../../common/domain/repository-interface';
import { EventSectionId } from '../entities/event-section';
import { EventId } from '../entities/event.entity';
import { WaitingList } from '../entities/waiting-list.entity';

export interface IWaitingListRepository extends IRepository<WaitingList> {
  findByEventIdAndSectionId(
    eventId: EventId | string,
    sectionId: EventSectionId | string,
  ): Promise<WaitingList | null>;
}
