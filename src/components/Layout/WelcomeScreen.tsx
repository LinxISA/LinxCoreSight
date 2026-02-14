/**
 * Welcome Screen Component
 * Shown when no project is open
 */

import React, { useState } from 'react';
import { useIDEStore } from '../../store/ideStore';

interface WelcomeScreenProps {
  onCreateProject: (name: string, path: string, template: string) => void;
  onOpenProject: (path: string) => void;
}

export function WelcomeScreen({ onCreateProject, onOpenProject }: WelcomeScreenProps) {
  const store = useIDEStore();
  const { recentProjects } = store;
  
  const [projectName, setProjectName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('empty');
  const [showNewProject, setShowNewProject] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const templates = [
    { id: 'empty', name: 'Empty Project', description: 'Start from scratch', icon: '📦' },
    { id: 'blink', name: 'Blink LED', description: 'Simple LED blinking example', icon: '💡' },
    { id: 'uart', name: 'UART Demo', description: 'Serial communication example', icon: '🔌' },
    { id: 'cpu', name: 'CPU Core', description: 'LinxISA CPU implementation', icon: '⚙️' },
  ];

  const handleCreate = async () => {
    if (!projectName || !projectPath) return;
    
    setIsCreating(true);
    try {
      onCreateProject(projectName, projectPath, selectedTemplate);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenFolder = async () => {
    const result = await window.electronAPI.openFolderDialog();
    if (!result.canceled && result.filePaths.length > 0) {
      onOpenProject(result.filePaths[0]);
    }
  };

  // Handle clicking on a recent project
  const handleRecentProjectClick = (path: string) => {
    onOpenProject(path);
  };

  return (
    <div 
      style={{ 
        backgroundColor: '#0a0e14',
        minHeight: 'calc(100vh - 40px)',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        overflow: 'auto'
      }}
    >
      {/* Logo and Title */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ 
          fontSize: '64px', 
          fontWeight: 'bold', 
          color: '#e6edf3',
          marginBottom: '16px'
        }}>
          L<span style={{ color: '#00d9ff' }}>CS</span>
        </div>
        <h1 style={{ 
          fontSize: '32px', 
          fontWeight: 'bold', 
          color: '#e6edf3',
          marginBottom: '8px',
          fontFamily: 'monospace'
        }}>
          Linx<span style={{ color: '#00d9ff' }}>CoreSight</span>
        </h1>
        <p style={{ fontSize: '18px', color: '#8b949e', marginBottom: '8px' }}>
          IDE for LinxISA Development + pyCircuit
        </p>
        <p style={{ fontSize: '14px', color: '#6e7681' }}>
          Design · Simulate · Debug · Deploy
        </p>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '800px', width: '100%' }}>
        {!showNewProject ? (
          // Project selection buttons
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
            gap: '16px',
            marginBottom: '32px'
          }}>
            {/* New Project */}
            <button
              onClick={() => setShowNewProject(true)}
              style={{
                padding: '24px',
                backgroundColor: '#111820',
                border: '1px solid #2d3a4d',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = '#00d9ff';
                e.currentTarget.style.backgroundColor = '#1a2332';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = '#2d3a4d';
                e.currentTarget.style.backgroundColor = '#111820';
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '16px' }}>➕</div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#e6edf3', marginBottom: '8px' }}>
                New Project
              </h3>
              <p style={{ color: '#8b949e', fontSize: '14px' }}>
                Create a new LinxCoreSight project from a template
              </p>
            </button>

            {/* Open Project */}
            <button
              onClick={handleOpenFolder}
              style={{
                padding: '24px',
                backgroundColor: '#111820',
                border: '1px solid #2d3a4d',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = '#00d9ff';
                e.currentTarget.style.backgroundColor = '#1a2332';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = '#2d3a4d';
                e.currentTarget.style.backgroundColor = '#111820';
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '16px' }}>📂</div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#e6edf3', marginBottom: '8px' }}>
                Open Project
              </h3>
              <p style={{ color: '#8b949e', fontSize: '14px' }}>
                Open an existing LinxCoreSight project folder
              </p>
            </button>
          </div>
        ) : (
          // New Project Form
          <div style={{
            backgroundColor: '#111820',
            border: '1px solid #2d3a4d',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '32px',
            maxWidth: '500px',
            margin: '0 auto 32px'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#e6edf3', marginBottom: '24px' }}>
              Create New Project
            </h2>

            {/* Project Name */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#8b949e', fontSize: '14px', marginBottom: '8px' }}>
                Project Name
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="my-project"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#1a2332',
                  border: '1px solid #2d3a4d',
                  borderRadius: '4px',
                  color: '#e6edf3',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>

            {/* Project Location */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#8b949e', fontSize: '14px', marginBottom: '8px' }}>
                Location
              </label>
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/Users/username/projects/"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#1a2332',
                  border: '1px solid #2d3a4d',
                  borderRadius: '4px',
                  color: '#e6edf3',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>

            {/* Template Selection */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: '#8b949e', fontSize: '14px', marginBottom: '8px' }}>
                Template
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template.id)}
                    style={{
                      padding: '12px',
                      border: selectedTemplate === template.id ? '1px solid #00d9ff' : '1px solid #2d3a4d',
                      borderRadius: '4px',
                      backgroundColor: selectedTemplate === template.id ? 'rgba(0, 217, 255, 0.1)' : '#1a2332',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontSize: '20px', marginBottom: '4px' }}>{template.icon}</div>
                    <div style={{ color: '#e6edf3', fontWeight: '500', fontSize: '14px' }}>{template.name}</div>
                    <div style={{ color: '#6e7681', fontSize: '12px' }}>{template.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowNewProject(false)}
                style={{
                  padding: '8px 24px',
                  border: '1px solid #2d3a4d',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  color: '#8b949e',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!projectName || !projectPath || isCreating}
                style={{
                  flex: 1,
                  padding: '8px 24px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: (!projectName || !projectPath) ? '#00d9ff50' : '#00d9ff',
                  color: '#0a0e14',
                  fontWeight: '600',
                  cursor: (projectName && projectPath) ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  opacity: isCreating ? 0.7 : 1
                }}
              >
                {isCreating ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        )}

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#e6edf3', marginBottom: '16px' }}>
              Recent Projects
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentProjects.slice(0, 5).map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleRecentProjectClick(project.path)}
                  style={{
                    padding: '12px',
                    backgroundColor: '#111820',
                    border: '1px solid #2d3a4d',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = '#00d9ff';
                    e.currentTarget.style.backgroundColor = '#1a2332';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = '#2d3a4d';
                    e.currentTarget.style.backgroundColor = '#111820';
                  }}
                >
                  <span style={{ fontSize: '20px' }}>📁</span>
                  <div>
                    <div style={{ color: '#e6edf3', fontWeight: '500' }}>{project.name}</div>
                    <div style={{ color: '#6e7681', fontSize: '12px' }}>{project.path}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ 
        marginTop: '48px', 
        paddingTop: '24px', 
        borderTop: '1px solid #2d3a4d',
        textAlign: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#6e7681', fontSize: '12px' }}>
          <div style={{ width: '8px', height: '1px', background: 'linear-gradient(90deg, transparent, #00d9ff)' }}></div>
          <span>LinxCoreSight v1.0.0</span>
          <div style={{ width: '8px', height: '1px', background: 'linear-gradient(90deg, #a855f7, transparent)' }}></div>
        </div>
      </div>
    </div>
  );
}
