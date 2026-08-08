import { IsString } from 'class-validator';

export class AssignSystemCustomerDto {
  @IsString()
  customerId: string;
}
