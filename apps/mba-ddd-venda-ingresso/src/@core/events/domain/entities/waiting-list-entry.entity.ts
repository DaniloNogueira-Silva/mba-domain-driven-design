import { Entity } from '../../../common/domain/entity';
import Uuid from '../../../common/domain/value-objects/uuid.vo';
import { CustomerId } from './customer.entity';

export enum WaitingListStatus {
  PENDING = 'PENDING',
  NOTIFIED = 'NOTIFIED',
}

export class WaitingListEntryId extends Uuid {}

export type WaitingListEntryConstructorProps = {
  id?: WaitingListEntryId | string;
  customer_id: CustomerId | string;
  status?: WaitingListStatus;
  sequence?: number;
};

export class WaitingListEntry extends Entity {
  id: WaitingListEntryId;
  customer_id: CustomerId;
  status: WaitingListStatus;
  sequence: number;

  constructor(props: WaitingListEntryConstructorProps) {
    super();
    this.id =
      typeof props.id === 'string'
        ? new WaitingListEntryId(props.id)
        : props.id ?? new WaitingListEntryId();
    this.customer_id =
      props.customer_id instanceof CustomerId
        ? props.customer_id
        : new CustomerId(props.customer_id);
    this.status = props.status ?? WaitingListStatus.PENDING;
    this.sequence = props.sequence ?? 0;
  }

  static create(props: {
    customer_id: CustomerId | string;
    sequence?: number;
  }) {
    return new WaitingListEntry({
      ...props,
      status: WaitingListStatus.PENDING,
    });
  }

  promote() {
    this.status = WaitingListStatus.NOTIFIED;
  }

  notify() {
    this.promote();
  }

  toJSON() {
    return {
      id: this.id.value,
      customer_id: this.customer_id.value,
      status: this.status,
      sequence: this.sequence,
    };
  }
}
