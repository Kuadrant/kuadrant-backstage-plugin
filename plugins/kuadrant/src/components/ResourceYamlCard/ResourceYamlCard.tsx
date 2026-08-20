import React from "react";
import { InfoCard, CodeSnippet } from "@backstage/core-components";
import yaml from "js-yaml";

/**
 * read-only YAML view of any k8s-style resource: dumps the object to YAML and
 * renders it in a syntax-highlighted, copyable, non-editable code block.
 * shared across read-only resource detail pages.
 */
export const ResourceYamlCard = ({
  resource,
  title = "YAML Manifest",
}: {
  resource: unknown;
  title?: string;
}) => (
  <InfoCard title={title}>
    <CodeSnippet
      text={yaml.dump(resource)}
      language="yaml"
      showLineNumbers
      showCopyCodeButton
    />
  </InfoCard>
);
