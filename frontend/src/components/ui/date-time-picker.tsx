import * as React from 'react';
import { format, parse, setHours, setMinutes } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

function datetimeLocalToDate(value: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

function dateToDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DateTimePicker({ value, onChange, required }: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const date = datetimeLocalToDate(value);
  const timeStr = date ? format(date, 'HH:mm') : '';

  const onSelectDate = (day: Date | undefined) => {
    if (!day) return;
    const h = date?.getHours() ?? 0;
    const m = date?.getMinutes() ?? 0;
    const combined = setMinutes(setHours(day, h), m);
    onChange(dateToDatetimeLocal(combined));
  };

  const onTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = e.target.value;
    if (!t) return;
    const base = date ?? new Date();
    const parsed = parse(t, 'HH:mm', base);
    if (!isNaN(parsed.getTime())) {
      const combined = setMinutes(setHours(base, parsed.getHours()), parsed.getMinutes());
      onChange(dateToDatetimeLocal(combined));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="default"
          className={cn(
            'w-full justify-start text-left font-normal',
            !date && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, 'dd MMM yyyy, HH:mm', { locale: ru }) : 'Выберите дату и время'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onSelectDate}
          autoFocus
        />
        <div className="border-t border-border px-3 py-2">
          <Input
            type="time"
            value={timeStr}
            onChange={onTimeChange}
            className="h-8"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
