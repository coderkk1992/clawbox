// Pixel art character components for agent avatars
// Each character is a 16x16 pixel grid rendered as SVG

interface PixelCharacterProps {
  size?: number;
  className?: string;
}

// Helper to render pixel grid
const PixelGrid = ({ pixels, colors, size = 64 }: { pixels: string[], colors: Record<string, string>, size?: number }) => {
  const gridSize = pixels.length;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${gridSize} ${gridSize}`} style={{ imageRendering: 'pixelated' }}>
      {pixels.map((row, y) =>
        row.split('').map((pixel, x) => {
          if (pixel === '.' || !colors[pixel]) return null;
          return (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill={colors[pixel]}
            />
          );
        })
      )}
    </svg>
  );
};

// 1. Lobster (ClawBox mascot) - friendly red lobster
export const PixelLobster = ({ size = 64, className }: PixelCharacterProps) => {
  const pixels = [
    '....RR....RR....',
    '...RRRR..RRRR...',
    '..RRRRRRRRRRRR..',
    '..RRRRRRRRRRRR..',
    '...RROORROORR...',
    '...RROORROORR...',
    '....RRRRRRRR....',
    '.....RRRRRR.....',
    '..RRRRRRRRRRRR..',
    '.RRRRRRRRRRRRRR.',
    '.RRRRRRRRRRRRRR.',
    '..RRR.RRRR.RRR..',
    '..RR...RR...RR..',
    '..R....RR....R..',
    '.......RR.......',
    '......RRRR......',
  ];
  const colors = { 'R': '#e63946', 'O': '#1a1a2e' };
  return <div className={className}><PixelGrid pixels={pixels} colors={colors} size={size} /></div>;
};

// 2. Robot Assistant - helpful blue robot
export const PixelRobot = ({ size = 64, className }: PixelCharacterProps) => {
  const pixels = [
    '....BBBBBB......',
    '...BBBBBBBB.....',
    '..BBBBBBBBBB....',
    '..BBWWBBWWBB....',
    '..BBWWBBWWBB....',
    '..BBBBBBBBBB....',
    '..BBBGGGGGBB....',
    '...BBBBBBBB.....',
    '....SSSSSS......',
    '...SSSSSSSS.....',
    '..SSSSSSSSSS....',
    '..SS.SSSS.SS....',
    '..SS.SSSS.SS....',
    '.....SSSS.......',
    '....SS..SS......',
    '....SS..SS......',
  ];
  const colors = { 'B': '#4f46e5', 'W': '#ffffff', 'S': '#6366f1', 'G': '#22c55e' };
  return <div className={className}><PixelGrid pixels={pixels} colors={colors} size={size} /></div>;
};

// 3. Wizard Coder - purple wizard with code powers
export const PixelWizard = ({ size = 64, className }: PixelCharacterProps) => {
  const pixels = [
    '.......PP.......',
    '......PPPP......',
    '.....PPPPPP.....',
    '....PPPPPPPP....',
    '...PPPPPPPPPP...',
    '...PPFFFFFFPP...',
    '...FFWWFFWWFF...',
    '...FFWWFFWWFF...',
    '...FFFFFFFFFF...',
    '...FFFFJJFFFF...',
    '....PPPPPPPP....',
    '...PPPPPPPPPP...',
    '..PPPP.PP.PPPP..',
    '..PPP..PP..PPP..',
    '.......PP.......',
    '......PPPP......',
  ];
  const colors = { 'P': '#7c3aed', 'F': '#fcd34d', 'W': '#1a1a2e', 'J': '#f97316' };
  return <div className={className}><PixelGrid pixels={pixels} colors={colors} size={size} /></div>;
};

// 4. Scientist Researcher - lab coat with glasses
export const PixelScientist = ({ size = 64, className }: PixelCharacterProps) => {
  const pixels = [
    '......BBBB......',
    '.....BBBBBB.....',
    '....BBBBBBBB....',
    '....FFFFFFFF....',
    '...GGFFGGFFGG...',
    '...GGFFGGFFGG...',
    '....FFFFFFFF....',
    '....FFFJJFFF....',
    '.....FFFFFF.....',
    '....WWWWWWWW....',
    '...WWWWWWWWWW...',
    '..WWWWWWWWWWWW..',
    '..WWW.WWWW.WWW..',
    '..WW..WWWW..WW..',
    '......WWWW......',
    '.....WW..WW.....',
  ];
  const colors = { 'B': '#8b5cf6', 'F': '#fcd34d', 'G': '#1e3a5f', 'W': '#ffffff', 'J': '#f97316' };
  return <div className={className}><PixelGrid pixels={pixels} colors={colors} size={size} /></div>;
};

// 5. Artist Creative - beret and paint splashes
export const PixelArtist = ({ size = 64, className }: PixelCharacterProps) => {
  const pixels = [
    '....MMMMMM......',
    '...MMMMMMMM.....',
    '..MMMMMMMMMM....',
    '....FFFFFFFF....',
    '....FFWWWWFF....',
    '....FFWBWBFF....',
    '....FFFFFFFF....',
    '....FFFJJFFF....',
    '.....FFFFFF.....',
    '....PPPPPPPP....',
    '...PPPRPPGPPP...',
    '..PPPPRPGGGPP...',
    '..PPP.PPPP.PPP..',
    '..PP..PPPP..PP..',
    '......PPPP......',
    '.....PP..PP.....',
  ];
  const colors = { 'M': '#db2777', 'F': '#fcd34d', 'W': '#ffffff', 'B': '#1a1a2e', 'P': '#f472b6', 'R': '#ef4444', 'G': '#22c55e', 'J': '#f97316' };
  return <div className={className}><PixelGrid pixels={pixels} colors={colors} size={size} /></div>;
};

// 6. Teacher/Tutor - glasses and book
export const PixelTeacher = ({ size = 64, className }: PixelCharacterProps) => {
  const pixels = [
    '......BBBB......',
    '.....BBBBBB.....',
    '....BBBBBBBB....',
    '....FFFFFFFF....',
    '...GGFFGGFFGG...',
    '...GGFFGGFFGG...',
    '....FFFFFFFF....',
    '....FFFJJFFF....',
    '.....FFFFFF.....',
    '....GGGGGGGG....',
    '...GGGGGGGGGG...',
    '..GGGGGGGGGGGG..',
    '..GGG.GGGG.GGG..',
    '..GG..GGGG..GG..',
    '......GGGG......',
    '.....GG..GG.....',
  ];
  const colors = { 'B': '#854d0e', 'F': '#fcd34d', 'G': '#059669', 'J': '#f97316' };
  return <div className={className}><PixelGrid pixels={pixels} colors={colors} size={size} /></div>;
};

// 7. Ninja - stealthy dark helper
export const PixelNinja = ({ size = 64, className }: PixelCharacterProps) => {
  const pixels = [
    '......DDDD......',
    '.....DDDDDD.....',
    '....DDDDDDDD....',
    '....DDDDDDDD....',
    '...DDWWDDWWDD...',
    '...DDWWDDWWDD...',
    '....DDDDDDDD....',
    '....DDDDDDDD....',
    '.....DDDDDD.....',
    '....DDDDDDDD....',
    '...DDDDDDDDDD...',
    '..DDDDDDDDDDDD..',
    '..DDD.DDDD.DDD..',
    '..DD..DDDD..DD..',
    '......DDDD......',
    '.....DD..DD.....',
  ];
  const colors = { 'D': '#1a1a2e', 'W': '#ffffff' };
  return <div className={className}><PixelGrid pixels={pixels} colors={colors} size={size} /></div>;
};

// 8. Astronaut - space explorer
export const PixelAstronaut = ({ size = 64, className }: PixelCharacterProps) => {
  const pixels = [
    '....WWWWWW......',
    '...WWWWWWWW.....',
    '..WWWWWWWWWW....',
    '..WWCCCCCCWW....',
    '..WWCFWWFCWW....',
    '..WWCFBBFCWW....',
    '..WWCCCCCCWW....',
    '..WWCCJJCCWW....',
    '...WWWWWWWW.....',
    '....GGGGGG......',
    '...GGGGGGGG.....',
    '..GGGGGGGGGG....',
    '..GGG.GGGG.GGG..',
    '..GG..GGGG..GG..',
    '......GGGG......',
    '.....GG..GG.....',
  ];
  const colors = { 'W': '#ffffff', 'C': '#0ea5e9', 'F': '#fcd34d', 'B': '#1a1a2e', 'G': '#e5e5e5', 'J': '#f97316' };
  return <div className={className}><PixelGrid pixels={pixels} colors={colors} size={size} /></div>;
};

// 9. Chef - cooking assistant
export const PixelChef = ({ size = 64, className }: PixelCharacterProps) => {
  const pixels = [
    '....WWWWWW......',
    '...WWWWWWWW.....',
    '..WWWWWWWWWW....',
    '..WWWWWWWWWW....',
    '....FFFFFFFF....',
    '....FFWWWWFF....',
    '....FFWBWBFF....',
    '....FFFFFFFF....',
    '....FFFJJFFF....',
    '.....FFFFFF.....',
    '....WWWWWWWW....',
    '...WWWWWWWWWW...',
    '..WWWW.WW.WWWW..',
    '..WWW..WW..WWW..',
    '......WWWW......',
    '.....WW..WW.....',
  ];
  const colors = { 'W': '#ffffff', 'F': '#fcd34d', 'B': '#1a1a2e', 'J': '#f97316' };
  return <div className={className}><PixelGrid pixels={pixels} colors={colors} size={size} /></div>;
};

// 10. Detective - mystery solver with magnifying glass
export const PixelDetective = ({ size = 64, className }: PixelCharacterProps) => {
  const pixels = [
    '....BBBBBB......',
    '...BBBBBBBB.....',
    '..BBBBBBBBBB....',
    '..BBBBBBBBBB....',
    '....FFFFFFFF....',
    '....FFWWWWFF....',
    '....FFWBWBFF....',
    '....FFFFFFFF....',
    '....FFFJJFFF....',
    '.....FFFFFF.....',
    '....TTTTTTTT....',
    '...TTTTTTTTTT...',
    '..TTTT.TT.TTTT..',
    '..TTT..TT..TTT..',
    '......TTTT......',
    '.....TT..TT.....',
  ];
  const colors = { 'B': '#78716c', 'F': '#fcd34d', 'W': '#ffffff', 'T': '#a16207', 'J': '#f97316' };
  return <div className={className}><PixelGrid pixels={pixels} colors={colors} size={size} /></div>;
};

// Map persona types to characters
export const getPixelCharacter = (persona: string): React.FC<PixelCharacterProps> => {
  switch (persona) {
    case 'assistant':
      return PixelLobster;
    case 'coder':
      return PixelWizard;
    case 'researcher':
      return PixelScientist;
    case 'creative':
      return PixelArtist;
    case 'tutor':
      return PixelTeacher;
    case 'custom':
      return PixelRobot;
    default:
      return PixelLobster;
  }
};

// Export all characters for selection
export const ALL_PIXEL_CHARACTERS = [
  { id: 'lobster', name: 'Lobster', component: PixelLobster },
  { id: 'robot', name: 'Robot', component: PixelRobot },
  { id: 'wizard', name: 'Wizard', component: PixelWizard },
  { id: 'scientist', name: 'Scientist', component: PixelScientist },
  { id: 'artist', name: 'Artist', component: PixelArtist },
  { id: 'teacher', name: 'Teacher', component: PixelTeacher },
  { id: 'ninja', name: 'Ninja', component: PixelNinja },
  { id: 'astronaut', name: 'Astronaut', component: PixelAstronaut },
  { id: 'chef', name: 'Chef', component: PixelChef },
  { id: 'detective', name: 'Detective', component: PixelDetective },
];
