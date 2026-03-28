// components/redirect-uri-section.tsx

import { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Paper,
} from '@mui/material';
import {
  Info as InfoIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
} from '@mui/icons-material';

interface RedirectUriSectionProps {
  redirectUri: string;
}

export function RedirectUriSection({ redirectUri }: RedirectUriSectionProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy redirect URI');
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        mb: 3,
        bgcolor: 'info.lighter',
        borderColor: 'info.light',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <InfoIcon sx={{ color: 'info.main', mt: 0.25 }} />
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>
            Redirect URI
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Use this URL when configuring your OAuth application
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              bgcolor: 'background.paper',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              p: 1,
              pr: 0.5,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'monospace',
                flexGrow: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {redirectUri}
            </Typography>
            <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
              <IconButton
                size="small"
                onClick={handleCopy}
                sx={{
                  ml: 1,
                  color: copied ? 'success.main' : 'action.active',
                }}
              >
                {copied ? <CheckIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
