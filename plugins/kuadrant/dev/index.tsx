import React from 'react';
import { createDevApp } from '@backstage/dev-utils';
import { kuadrantPlugin, KuadrantPage } from '../src/plugin';

createDevApp()
  .registerPlugin(kuadrantPlugin)
  .addPage({
    element: <KuadrantPage />,
    title: 'Root Page',
    path: '/kuadrant',
  })
  .render();
