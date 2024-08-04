import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, useReactFlow, getOutgoers } from '@xyflow/react';
import { getConversationHistory, sendConversationRequest, findAllDescendants } from './Utility';

const UserInputNode = (props) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(props.data.text);
  const reactFlow = useReactFlow();
  const textareaRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (props.data.text !== text) {
      console.log("UserInputNode props updated:", props.data.text);
      console.trace("UserInputNode props update trace:");
      setText(props.data.text);
    }
  }, [props.data.text]);

  const onChunkReceived = useCallback((content, nodeId) => {
    reactFlow.setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          return { ...n,
            data: { 
            ...n.data, 
            text: n.data.text + content 
            }};
        }
        return n;
      })
    );
  }, [reactFlow]);

  const regenerateNode = useCallback(async (node) => {
    const nodes = reactFlow.getNodes();
    const edges = reactFlow.getEdges();
    const history = getConversationHistory(node, nodes, edges);

    try {
      await sendConversationRequest('generate', history, (content) => onChunkReceived(content, node.id));
    } catch (error) {
      console.error('Failed to generate response:', error);
    }
  }, [reactFlow, onChunkReceived]);

  const onRegenerate = useCallback(async () => {
    const nodes = reactFlow.getNodes();
    const edges = reactFlow.getEdges();
    const userNode = reactFlow.getNode(props.id);
    const outgoers = getOutgoers(userNode, nodes, edges);

    // If no LLM response node, create one
    if (outgoers.length === 0) {
      const llmNode = {
        id: `llmResponse-${Date.now()}`,
        type: 'llmResponse',
        data: { text: '' },
        position: { x: userNode.position.x, y: userNode.position.y + 150 },
      };

      reactFlow.setNodes((nds) => nds.concat(llmNode));
      reactFlow.setEdges((eds) => eds.concat({
        id: `e${userNode.id}-${llmNode.id}`,
        source: userNode.id,
        target: llmNode.id,
        type: 'custom',
      }));

      await regenerateNode(llmNode);
    }

    // Regenerate all descendants
    const descendants = findAllDescendants(userNode.id, nodes, edges);
    for (const descendantId of descendants) {
      const descendantNode = nodes.find(n => n.id === descendantId);
      if (descendantNode.type === 'llmResponse') {
        descendantNode.data.text = ''; // Clear the previous text
        await regenerateNode(descendantNode);
      }
    }
  }, [props.id, reactFlow, regenerateNode]);

  const onTextChange = useCallback((evt) => {
    setText(evt.target.value);
  }, []);

  const onTextBlur = useCallback(() => {
    setIsEditing(false);
    reactFlow.setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === props.id) {
          node.data = { ...node.data, text: text };
        }
        return node;
      })
    );
  }, [props.id, reactFlow, text]);

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      }
    }, 100);
  }, []);

  const updateSize = useCallback(() => {
    if (textareaRef.current && wrapperRef.current) {
      const textareaHeight = textareaRef.current.scrollHeight;
      wrapperRef.current.style.height = `${textareaHeight + 60}px`; // Add padding
      wrapperRef.current.style.width = `${textareaRef.current.offsetWidth + 32}px`; // Add padding
    }
  }, []);

  useEffect(() => {
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [updateSize]);

  useEffect(() => {
    updateSize();
  }, [text, isEditing, updateSize]);

  const commonTextareaStyles = `
    w-full p-2 text-gray-700 border rounded
    overflow-hidden whitespace-pre-wrap break-words
    focus:outline-none focus:ring-2 focus:ring-blue-500
    nodrag
  `;

  return (
    <div ref={wrapperRef} className={`relative`}>
      <div className={`absolute inset-0 px-4 py-2 shadow-md rounded-md bg-green-100 border-2  ${props.selected ? 'border-green-500' : 'border-green-200'} `}>
        <Handle 
          type="target" 
          position={Position.Top} 
          className="!w-3 !h-3 !bg-teal-500" 
          style={{ top: -10 }}
        />
        <div className="font-bold text-sm text-green-700 mb-2">User Input</div>
        <textarea
          ref={textareaRef}
          className={`${commonTextareaStyles} ${isEditing ? 'nopan nowheel resize' : 'bg-transparent resize-none'}`}
          value={text}
          onChange={onTextChange}
          onBlur={onTextBlur}
          readOnly={!isEditing}
          onDoubleClick={handleDoubleClick}
          style={{ 
            height: 'auto',
            minWidth: '10em',
            maxHeight: isEditing ? '30em' : 'none',
            cursor: isEditing ? 'text' : 'default'
          }}
        />
        <Handle 
          type="source" 
          position={Position.Bottom} 
          className="!w-3 !h-3 !bg-teal-500" 
          style={{ bottom: -10 }}
        />
        <button
          className="absolute top-0 right-0 bg-green-300 text-white rounded-full w-5 h-5 flex items-center justify-center"
          onClick={onRegenerate}
        >
          ♻️
        </button>
      </div>
    </div>
  );
};

export default memo(UserInputNode);