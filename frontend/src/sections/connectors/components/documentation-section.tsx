// components/documentation-section.tsx

import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Link,
  Paper,
} from '@mui/material';
import {
  Description as DocIcon,
  OpenInNew as OpenInNewIcon,
  Settings as SetupIcon,
  Code as ApiIcon,
  Extension as ConnectorIcon,
} from '@mui/icons-material';
import type { DocumentationLink, DocType } from '../types/types';

interface DocumentationSectionProps {
  links: DocumentationLink[];
}

const getIconForDocType = (docType: DocType) => {
  switch (docType) {
    case 'setup':
      return <SetupIcon fontSize="small" />;
    case 'api':
      return <ApiIcon fontSize="small" />;
    case 'connector':
      return <ConnectorIcon fontSize="small" />;
    default:
      return <DocIcon fontSize="small" />;
  }
};

export function DocumentationSection({ links }: DocumentationSectionProps) {
  if (!links || links.length === 0) {
    return null;
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        mb: 3,
        bgcolor: 'grey.50',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <DocIcon sx={{ color: 'text.secondary', mt: 0.25 }} />
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>
            Setup Documentation
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Follow these guides to complete setup
          </Typography>
          <List dense disablePadding>
            {links.map((link, index) => (
              <ListItem
                key={index}
                disablePadding
                sx={{
                  py: 0.5,
                  '&:hover': {
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {getIconForDocType(link.docType)}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Link
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      underline="hover"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        color: 'primary.main',
                        fontWeight: 500,
                      }}
                    >
                      {link.title}
                      <OpenInNewIcon sx={{ fontSize: 14 }} />
                    </Link>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Box>
      </Box>
    </Paper>
  );
}
