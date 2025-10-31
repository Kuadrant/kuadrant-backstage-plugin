import React from 'react';

import { identityApiRef, useApi } from '@backstage/core-plugin-api';

import { Avatar, Box, IconButton, Menu, MenuItem } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(theme => ({
  userMenu: {
    position: 'absolute',
    right: theme.spacing(2),
    top: theme.spacing(1),
    zIndex: 1300,
  },
  avatar: {
    width: theme.spacing(4),
    height: theme.spacing(4),
  },
}));

export const UserMenu = () => {
  const classes = useStyles();
  const identityApi = useApi(identityApiRef);
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [profile, setProfile] = React.useState<{
    displayName?: string;
    email?: string;
  } | null>(null);

  React.useEffect(() => {
    identityApi.getProfileInfo().then(setProfile);
  }, [identityApi]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSignOut = async () => {
    await identityApi.signOut();
    handleClose();
  };

  if (!profile) {
    return null;
  }

  const initials = profile.displayName
    ? profile.displayName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
    : '?';

  return (
    <Box className={classes.userMenu}>
      <IconButton onClick={handleClick} size="small">
        <Avatar className={classes.avatar}>{initials}</Avatar>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem disabled>
          <div>
            <div>{profile.displayName}</div>
            <div style={{ fontSize: '0.875rem', color: 'grey' }}>
              {profile.email}
            </div>
          </div>
        </MenuItem>
        <MenuItem
          onClick={() => {
            window.location.href = '/settings';
            handleClose();
          }}
        >
          Settings
        </MenuItem>
        <MenuItem onClick={handleSignOut}>Sign Out</MenuItem>
      </Menu>
    </Box>
  );
};
