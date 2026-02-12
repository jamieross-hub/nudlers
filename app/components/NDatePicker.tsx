import React from 'react';
import { Skeleton } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { parseISO, format, isValid } from 'date-fns';

interface NDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string | null;
  loading?: boolean;
  maxDate?: Date;
  minDate?: Date;
  disabled?: boolean;
  fullWidth?: boolean;
}

const NDatePicker: React.FC<NDatePickerProps> = ({
  value,
  onChange,
  label,
  error,
  loading = false,
  maxDate,
  minDate,
  disabled = false,
  fullWidth = true,
}) => {
  const dateValue = value ? parseISO(value) : null;
  const validDate = dateValue && isValid(dateValue) ? dateValue : null;

  const handleChange = (newDate: Date | null) => {
    if (newDate && isValid(newDate)) {
      onChange(format(newDate, 'yyyy-MM-dd'));
    } else {
      onChange('');
    }
  };

  if (loading) {
    return <Skeleton variant="rounded" height={40} sx={{ borderRadius: 'var(--n-radius-lg)' }} />;
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <DatePicker
        label={label}
        value={validDate}
        onChange={handleChange}
        maxDate={maxDate}
        minDate={minDate}
        disabled={disabled}
        format="yyyy-MM-dd"
        slotProps={{
          textField: {
            size: 'small',
            fullWidth,
            error: !!error,
            helperText: error,
            sx: {
              '& .MuiOutlinedInput-root': {
                borderRadius: 'var(--n-radius-lg)',
              },
            },
          },
          popper: {
            sx: {
              '& .MuiPaper-root': {
                background: 'var(--n-bg-surface)',
                border: '1px solid var(--n-border)',
                borderRadius: 'var(--n-radius-lg)',
                boxShadow: 'var(--n-shadow-lg)',
                backdropFilter: 'blur(20px)',
              },
              '& .MuiPickersDay-root.Mui-selected': {
                backgroundColor: 'var(--n-primary)',
                color: 'var(--n-primary-foreground)',
                '&:hover': {
                  backgroundColor: 'var(--n-primary-hover)',
                },
              },
            },
          },
          dialog: {
            sx: {
              '& .MuiPaper-root': {
                background: 'var(--n-bg-surface)',
                border: '1px solid var(--n-border)',
                borderRadius: 'var(--n-radius-lg)',
                boxShadow: 'var(--n-shadow-lg)',
                backdropFilter: 'blur(20px)',
              },
              '& .MuiPickersDay-root.Mui-selected': {
                backgroundColor: 'var(--n-primary)',
                color: 'var(--n-primary-foreground)',
                '&:hover': {
                  backgroundColor: 'var(--n-primary-hover)',
                },
              },
            },
          },
        }}
      />
    </LocalizationProvider>
  );
};

export default NDatePicker;
