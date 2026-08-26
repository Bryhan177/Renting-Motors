import { Directive, ElementRef, HostListener, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { formatCop, parseCop } from '../currency-co.util';

/**
 * Formatea el input como pesos colombianos mientras escribes: 25000 → 25.000
 * Uso: <input type="text" inputmode="numeric" appCurrencyCo [(ngModel)]="monto" />
 * El modelo sigue siendo number.
 */
@Directive({
  selector: 'input[appCurrencyCo]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CurrencyCoDirective),
      multi: true,
    },
  ],
})
export class CurrencyCoDirective implements ControlValueAccessor {
  private onChange: (value: number) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private el: ElementRef<HTMLInputElement>) {}

  writeValue(value: number | string | null): void {
    const input = this.el.nativeElement;
    if (value === null || value === undefined || value === '') {
      input.value = '';
      return;
    }
    const n = typeof value === 'number' ? value : parseCop(value);
    input.value = n > 0 ? formatCop(n) : '';
  }

  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.el.nativeElement.disabled = isDisabled;
  }

  @HostListener('input')
  onInput(): void {
    const input = this.el.nativeElement;
    const num = parseCop(input.value);
    const digits = String(input.value || '').replace(/\D/g, '');
    input.value = digits ? formatCop(num) : '';
    this.onChange(digits ? num : 0);
  }

  @HostListener('blur')
  onBlur(): void {
    this.onTouched();
    const input = this.el.nativeElement;
    const num = parseCop(input.value);
    input.value = num ? formatCop(num) : input.value.replace(/\D/g, '') ? '0' : '';
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const allowed = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allowed.includes(event.key) || event.ctrlKey || event.metaKey) return;
    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  }
}
