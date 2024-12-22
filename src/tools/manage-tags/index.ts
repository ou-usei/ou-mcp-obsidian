import { z } from "zod";
import { Tool } from "../../types.js";
import { promises as fs } from "fs";
import path from "path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { validateVaultPath } from "../../utils/path.js";
import { fileExists, getAllMarkdownFiles, safeReadFile } from "../../utils/files.js";
import { handleFsError, handleZodError } from "../../utils/errors.js";
import {
  validateTag,
  parseNote,
  stringifyNote,
  addTagsToFrontmatter,
  removeTagsFromFrontmatter,
  removeInlineTags,
  matchesTagPattern,
  isParentTag,
  getRelatedTags,
  normalizeTag
} from "../../utils/tags.js";

// Schema for tag management operations
const ManageTagsSchema = z.object({
  files: z.array(z.string())
    .min(1, "At least one file must be specified")
    .refine(
      files => files.every(f => f.endsWith('.md')),
      "All files must have .md extension"
    ),
  operation: z.enum(['add', 'remove']),
  tags: z.array(z.string())
    .min(1, "At least one tag must be specified")
    .refine(
      tags => tags.every(validateTag),
      "Invalid tag format. Tags must contain only letters, numbers, and forward slashes for hierarchy."
    ),
  options: z.object({
    location: z.enum(['frontmatter', 'content', 'both']).default('both'),
    normalize: z.boolean().default(true),
    position: z.enum(['start', 'end']).default('end'),
    preserveChildren: z.boolean().default(false),
    patterns: z.array(z.string()).default([])
  }).default({
    location: 'both',
    normalize: true,
    position: 'end',
    preserveChildren: false,
    patterns: []
  })
});

type TagOperation = z.infer<typeof ManageTagsSchema>;

interface OperationReport {
  success: string[];
  errors: { file: string; error: string }[];
  details: {
    [filename: string]: {
      removedTags: Array<{
        tag: string;
        location: 'frontmatter' | 'content';
        line?: number;
        context?: string;
      }>;
      preservedTags: Array<{
        tag: string;
        location: 'frontmatter' | 'content';
        line?: number;
        context?: string;
      }>;
    };
  };
}

async function manageTags(
  vaultPath: string,
  operation: TagOperation
): Promise<OperationReport> {
  const results: OperationReport = {
    success: [],
    errors: [],
    details: {}
  };

  for (const filename of operation.files) {
    const fullPath = path.join(vaultPath, filename);
    
    try {
      // Validate path is within vault
      validateVaultPath(vaultPath, fullPath);
      
      // Check if file exists
      if (!await fileExists(fullPath)) {
        results.errors.push({
          file: filename,
          error: "File not found"
        });
        continue;
      }

      // Read file content
      const content = await safeReadFile(fullPath);
      if (!content) {
        results.errors.push({
          file: filename,
          error: "Failed to read file"
        });
        continue;
      }

      // Parse the note
      const parsed = parseNote(content);
      let modified = false;
      results.details[filename] = {
        removedTags: [],
        preservedTags: []
      };

      if (operation.operation === 'add') {
        // Handle frontmatter tags for add operation
        if (operation.options.location !== 'content') {
          const updatedFrontmatter = addTagsToFrontmatter(
            parsed.frontmatter,
            operation.tags,
            operation.options.normalize
          );
          
          if (JSON.stringify(parsed.frontmatter) !== JSON.stringify(updatedFrontmatter)) {
            parsed.frontmatter = updatedFrontmatter;
            parsed.hasFrontmatter = true;
            modified = true;
          }
        }

        // Handle inline tags for add operation
        if (operation.options.location !== 'frontmatter') {
          const tagString = operation.tags
            .filter(tag => validateTag(tag))
            .map(tag => `#${operation.options.normalize ? normalizeTag(tag) : tag}`)
            .join(' ');

          if (tagString) {
            if (operation.options.position === 'start') {
              parsed.content = tagString + '\n\n' + parsed.content.trim();
            } else {
              parsed.content = parsed.content.trim() + '\n\n' + tagString;
            }
            modified = true;
          }
        }
      } else {
        // Handle frontmatter tags for remove operation
        if (operation.options.location !== 'content') {
          const { frontmatter: updatedFrontmatter, report } = removeTagsFromFrontmatter(
            parsed.frontmatter,
            operation.tags,
            {
              normalize: operation.options.normalize,
              preserveChildren: operation.options.preserveChildren,
              patterns: operation.options.patterns
            }
          );
          
          results.details[filename].removedTags.push(...report.removed);
          results.details[filename].preservedTags.push(...report.preserved);
          
          if (JSON.stringify(parsed.frontmatter) !== JSON.stringify(updatedFrontmatter)) {
            parsed.frontmatter = updatedFrontmatter;
            modified = true;
          }
        }

        // Handle inline tags for remove operation
        if (operation.options.location !== 'frontmatter') {
          const { content: newContent, report } = removeInlineTags(
            parsed.content,
            operation.tags,
            {
              normalize: operation.options.normalize,
              preserveChildren: operation.options.preserveChildren,
              patterns: operation.options.patterns
            }
          );
          
          results.details[filename].removedTags.push(...report.removed);
          results.details[filename].preservedTags.push(...report.preserved);
          
          if (parsed.content !== newContent) {
            parsed.content = newContent;
            modified = true;
          }
        }
      }

      // Save changes if modified
      if (modified) {
        const updatedContent = stringifyNote(parsed);
        await fs.writeFile(fullPath, updatedContent);
        results.success.push(filename);
      }
    } catch (error) {
      results.errors.push({
        file: filename,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
}

export function createManageTagsTool(vaultPath: string): Tool {
  return {
    name: "manage-tags",
    description: "Add or remove tags from notes, supporting both frontmatter and inline tags",
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: { type: "string" },
          description: "Array of note filenames to process"
        },
        operation: {
          type: "string",
          enum: ["add", "remove"],
          description: "Whether to add or remove the specified tags"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Array of tags to add or remove"
        },
        options: {
          type: "object",
          properties: {
            location: {
              type: "string",
              enum: ["frontmatter", "content", "both"],
              description: "Where to add/remove tags"
            },
            normalize: {
              type: "boolean",
              description: "Whether to normalize tag format (e.g., ProjectActive -> project-active)"
            },
            position: {
              type: "string",
              enum: ["start", "end"],
              description: "Where to add inline tags in content"
            },
            preserveChildren: {
              type: "boolean",
              description: "Whether to preserve child tags when removing parent tags"
            },
            patterns: {
              type: "array",
              items: { type: "string" },
              description: "Tag patterns to match for removal (supports * wildcard)"
            }
          }
        }
      },
      required: ["files", "operation", "tags"]
    },
    handler: async (args) => {
      try {
        // Parse and validate input
        const params = ManageTagsSchema.parse(args);
        
        // Execute tag management operation
        const results = await manageTags(vaultPath, params);
        
        // Format detailed response message
        let message = '';
        
        // Add success summary
        if (results.success.length > 0) {
          message += `Successfully processed tags in: ${results.success.join(', ')}\n\n`;
        }
        
        // Add detailed changes for each file
        for (const [filename, details] of Object.entries(results.details)) {
          if (details.removedTags.length > 0 || details.preservedTags.length > 0) {
            message += `Changes in ${filename}:\n`;
            
            if (details.removedTags.length > 0) {
              message += '  Removed tags:\n';
              details.removedTags.forEach(change => {
                message += `    - ${change.tag} (${change.location}`;
                if (change.line) {
                  message += `, line ${change.line}`;
                }
                message += ')\n';
              });
            }
            
            if (details.preservedTags.length > 0) {
              message += '  Preserved tags:\n';
              details.preservedTags.forEach(change => {
                message += `    - ${change.tag} (${change.location}`;
                if (change.line) {
                  message += `, line ${change.line}`;
                }
                message += ')\n';
              });
            }
            
            message += '\n';
          }
        }
        
        // Add errors if any
        if (results.errors.length > 0) {
          message += 'Errors:\n';
          results.errors.forEach(error => {
            message += `  ${error.file}: ${error.error}\n`;
          });
        }

        return {
          content: [{
            type: "text",
            text: message.trim()
          }]
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          handleZodError(error);
        }
        throw error;
      }
    }
  };
}
