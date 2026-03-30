import { Injectable } from '@nestjs/common';
import { ContractType } from '@prisma/client';

@Injectable()
export class InvoiceCalculatorService {
  calculate(params: {
    contractType: ContractType;
    fixedMonthlyFee?: number;
    pricePerKwh?: number;
    vatRate?: number;
    lateFeeRate?: number;
    earlyDiscountRate?: number;
    interestRate?: number;
    termMonths?: number;
    gridImportedKwh?: number;
    serviceFee?: number;
    principalAmount?: number;
    annualEscalationRate?: number;
    yearsFromStart?: number;
    applyLateFee?: boolean;
  }) {
    const {
      contractType,
      fixedMonthlyFee = 0,
      pricePerKwh = 0,
      vatRate = 0,
      lateFeeRate = 0,
      earlyDiscountRate = 0,
      interestRate = 0,
      termMonths = 12,
      gridImportedKwh = 0,
      serviceFee = 0,
      principalAmount = 0,
      annualEscalationRate = 0,
      yearsFromStart = 0,
      applyLateFee = false,
    } = params;

    const escalatedUnitPrice =
      pricePerKwh * Math.pow(1 + annualEscalationRate / 100, Math.max(0, yearsFromStart));

    let subtotal = 0;
    const items: {
      description: string;
      quantity: number;
      unitPrice: number;
      amount: number;
    }[] = [];

    if (contractType === 'PPA_KWH') {
      const amount = gridImportedKwh * escalatedUnitPrice;
      subtotal += amount;
      items.push({
        description: 'Electricity usage charge',
        quantity: gridImportedKwh,
        unitPrice: escalatedUnitPrice,
        amount,
      });
    }

    if (contractType === 'LEASE') {
      subtotal += fixedMonthlyFee + serviceFee;
      items.push({
        description: 'Monthly lease fee',
        quantity: 1,
        unitPrice: fixedMonthlyFee,
        amount: fixedMonthlyFee,
      });

      if (serviceFee > 0) {
        items.push({
          description: 'Maintenance fee',
          quantity: 1,
          unitPrice: serviceFee,
          amount: serviceFee,
        });
      }
    }

    if (contractType === 'INSTALLMENT') {
      const principal = principalAmount / termMonths;
      const interest = (principalAmount * interestRate) / 100 / 12;
      subtotal += principal + interest + serviceFee;
      items.push({
        description: 'Monthly principal',
        quantity: 1,
        unitPrice: principal,
        amount: principal,
      });
      items.push({
        description: 'Interest',
        quantity: 1,
        unitPrice: interest,
        amount: interest,
      });

      if (serviceFee > 0) {
        items.push({
          description: 'Service fee',
          quantity: 1,
          unitPrice: serviceFee,
          amount: serviceFee,
        });
      }
    }

    if (contractType === 'HYBRID') {
      const usageFee = gridImportedKwh * escalatedUnitPrice;
      subtotal += fixedMonthlyFee + usageFee + serviceFee;
      items.push({
        description: 'Fixed monthly fee',
        quantity: 1,
        unitPrice: fixedMonthlyFee,
        amount: fixedMonthlyFee,
      });
      items.push({
        description: 'Energy usage fee',
        quantity: gridImportedKwh,
        unitPrice: escalatedUnitPrice,
        amount: usageFee,
      });

      if (serviceFee > 0) {
        items.push({
          description: 'Service fee',
          quantity: 1,
          unitPrice: serviceFee,
          amount: serviceFee,
        });
      }
    }

    if (contractType === 'SALE') {
      subtotal += fixedMonthlyFee;
      items.push({
        description: 'System sale payment',
        quantity: 1,
        unitPrice: fixedMonthlyFee,
        amount: fixedMonthlyFee,
      });
    }

    const discountAmount = subtotal * (earlyDiscountRate / 100);
    const taxableAmount = subtotal - discountAmount;
    const vatAmount = taxableAmount * (vatRate / 100);
    const penaltyAmount = applyLateFee ? taxableAmount * (lateFeeRate / 100) : 0;
    const totalAmount = taxableAmount + vatAmount + penaltyAmount;

    return {
      subtotal,
      discountAmount,
      vatRate,
      vatAmount,
      penaltyAmount,
      totalAmount,
      escalatedUnitPrice,
      items,
    };
  }
}
