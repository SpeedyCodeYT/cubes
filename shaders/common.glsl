precision mediump float;

varying vec4 vColor;
varying highp vec3 vGridPosition;
varying highp vec3 vFixedOrientationPosition;
varying vec2 vTextureCoord;
varying float vFog;
varying vec3 vNormal;
varying float vDistanceFromEye;

// View geometry
uniform highp mat4 uPMatrix;
uniform highp mat4 uMVMatrix;
uniform highp vec3 uViewPosition;
uniform float uFogDistance;
uniform vec2 uPixelsPerClipUnit;

// Texturing
uniform bool uTextureEnabled;
uniform sampler2D uSampler;
uniform samplerCube uSkySampler;
uniform sampler2D uNoiseSampler;
uniform sampler2D uLightSampler;
uniform float uTileSize; // always integer, but used as float

// Global rendering properties
uniform bool uFocusCue;
uniform float uExposure;
