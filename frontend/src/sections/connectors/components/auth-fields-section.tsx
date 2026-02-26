// components/auth-fields-section.tsx

import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
} from '@mui/material';
import {
  Key as KeyIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import type { AuthField } from '../types/types';

interface AuthFieldsSectionProps {
  fields: AuthField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  errors?: Record<string, string>;
}

export function AuthFieldsSection({
  fields,
  values,
  onChange,
  errors = {},
}: AuthFieldsSectionProps) {
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const toggleShowSecret = (fieldName: string) => {
    setShowSecrets((prev) => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }));
  };

  const renderField = (field: AuthField) => {
    const value = values[field.name] || '';
    const error = errors[field.name];
    const showPassword = showSecrets[field.name];

    switch (field.fieldType) {
      case 'PASSWORD':
        return (
          <TextField
            key={field.name}
            fullWidth
            label={field.displayName}
            type={showPassword ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            required={field.isRequired}
            error={!!error}
            helperText={error || field.helpText}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => toggleShowSecret(field.name)}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            sx={{ mb: 2.5 }}
          />
        );

      case 'TEXTAREA':
        return (
          <TextField
            key={field.name}
            fullWidth
            multiline
            rows={3}
            label={field.displayName}
            value={value}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            required={field.isRequired}
            error={!!error}
            helperText={error || field.helpText}
            sx={{ mb: 2.5 }}
          />
        );

      case 'SELECT':
        return (
          <FormControl
            key={field.name}
            fullWidth
            required={field.isRequired}
            error={!!error}
            sx={{ mb: 2.5 }}
          >
            <InputLabel>{field.displayName}</InputLabel>
            <Select
              value={value}
              label={field.displayName}
              onChange={(e) => onChange(field.name, e.target.value as string)}
            >
              {field.options?.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>{error || field.helpText}</FormHelperText>
          </FormControl>
        );

      case 'URL':
        return (
          <TextField
            key={field.name}
            fullWidth
            type="url"
            label={field.displayName}
            value={value}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            required={field.isRequired}
            error={!!error}
            helperText={error || field.helpText}
            sx={{ mb: 2.5 }}
          />
        );

      case 'EMAIL':
        return (
          <TextField
            key={field.name}
            fullWidth
            type="email"
            label={field.displayName}
            value={value}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            required={field.isRequired}
            error={!!error}
            helperText={error || field.helpText}
            sx={{ mb: 2.5 }}
          />
        );

      case 'TEXT':
      default:
        return (
          <TextField
            key={field.name}
            fullWidth
            label={field.displayName}
            value={value}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            required={field.isRequired}
            error={!!error}
            helperText={error || field.helpText}
            sx={{ mb: 2.5 }}
          />
        );
    }
  };

  if (!fields || fields.length === 0) {
    return null;
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        mb: 3,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
        <KeyIcon sx={{ color: 'text.secondary', mt: 0.25 }} />
        <Box>
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>
            OAuth2 Credentials
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enter your authentication details
          </Typography>
        </Box>
      </Box>
      <Box sx={{ pl: 4.5 }}>
        {fields.map(renderField)}
      </Box>
    </Paper>
  );
}
