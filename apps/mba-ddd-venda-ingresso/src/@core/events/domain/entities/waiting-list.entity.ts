import { AggregateRoot } from '../../../common/domain/aggregate-root';
import {
  AnyCollection,
  ICollection,
  MyCollectionFactory,
} from '../../../common/domain/my-collection';
import Uuid from '../../../common/domain/value-objects/uuid.vo';
import { CustomerId } from './customer.entity';
import { EventSectionId } from './event-section';
import { EventSpotId } from './event-spot';
import { EventId } from './event.entity';
import {
  WaitingListEntry,
  WaitingListEntryId,
  WaitingListStatus,
} from './waiting-list-entry.entity';
import { CustomerJoinedWaitingList } from '../events/domain-events/customer-joined-waiting-list.event';
import { SpotOfferedToWaitingCustomer } from '../events/domain-events/spot-offered-to-waiting-customer.event';

export class WaitingListId extends Uuid {}

export type WaitingListConstructorProps = {
  id?: WaitingListId | string;
  event_id: EventId | string;
  section_id: EventSectionId | string;
};

export class WaitingList extends AggregateRoot {
  id: WaitingListId;
  event_id: EventId;
  section_id: EventSectionId;
  private _entries: ICollection<WaitingListEntry>;

  constructor(props: WaitingListConstructorProps) {
    super();
    this.id =
      typeof props.id === 'string'
        ? new WaitingListId(props.id)
        : props.id ?? new WaitingListId();
    this.event_id =
      props.event_id instanceof EventId
        ? props.event_id
        : new EventId(props.event_id);
    this.section_id =
      props.section_id instanceof EventSectionId
        ? props.section_id
        : new EventSectionId(props.section_id);
    this._entries = MyCollectionFactory.create<WaitingListEntry>(this);
  }

  static create(props: {
    event_id: EventId | string;
    section_id: EventSectionId | string;
  }) {
    return new WaitingList(props);
  }

  addEntry(
    command: CustomerId | { customer_id: CustomerId | string },
  ): WaitingListEntry {
    const customerId =
      command instanceof CustomerId
        ? command
        : command.customer_id instanceof CustomerId
        ? command.customer_id
        : new CustomerId(command.customer_id);

    const existingPending = this.entries.find(
      (entry) =>
        entry.customer_id.equals(customerId) &&
        entry.status === WaitingListStatus.PENDING,
    );

    if (existingPending) {
      throw new Error('Customer already in waiting list');
    }

    const currentEntries = [...this.entries];
    const nextSequence = currentEntries.length + 1;

    const entry = WaitingListEntry.create({
      customer_id: customerId,
      sequence: nextSequence,
    });

    this._entries.add(entry);

    this.addEvent(
      new CustomerJoinedWaitingList(
        this.id,
        this.event_id,
        this.section_id,
        customerId,
      ),
    );

    return entry;
  }

  promoteFirstPending(spot_id: EventSpotId | string): WaitingListEntry | null {
    const spotId =
      spot_id instanceof EventSpotId ? spot_id : new EventSpotId(spot_id);

    const pendingEntry = [...this.entries]
      .sort((a, b) => a.sequence - b.sequence)
      .find((entry) => entry.status === WaitingListStatus.PENDING);

    if (!pendingEntry) {
      return null;
    }

    pendingEntry.promote();

    this.addEvent(
      new SpotOfferedToWaitingCustomer(
        this.id,
        pendingEntry.customer_id,
        this.event_id,
        this.section_id,
        spotId,
      ),
    );

    return pendingEntry;
  }

  notifyFirstPending(spot_id: EventSpotId | string): WaitingListEntry | null {
    return this.promoteFirstPending(spot_id);
  }

  get entries(): ICollection<WaitingListEntry> {
    return this._entries as ICollection<WaitingListEntry>;
  }

  set entries(entries: AnyCollection<WaitingListEntry>) {
    this._entries = MyCollectionFactory.createFrom<WaitingListEntry>(entries);
  }

  toJSON() {
    return {
      id: this.id.value,
      event_id: this.event_id.value,
      section_id: this.section_id.value,
      entries: [...this.entries].map((entry) => entry.toJSON()),
    };
  }
}
