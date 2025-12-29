
import { Character } from '../types';
import { CHARACTERS } from '../characters';

interface CharacterGalleryProps {
  onSelect: (character: Character) => void;
}

const CharacterGallery: React.FC<CharacterGalleryProps> = ({ onSelect }) => {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <div className="mb-12">
        <h2 className="text-4xl md:text-5xl font-extrabold font-brand text-white mb-2 bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
          CORTIS Official
        </h2>
        <p className="text-slate-400 text-lg max-w-2xl font-medium">
          Không gian riêng tư để kết nối cùng các thành viên CORTIS. Gặp gỡ những thần tượng trong mơ của bạn ngay bây giờ.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-8">
        {CHARACTERS.map(character => (
          <div 
            key={character.id}
            className="group relative h-[480px] bg-slate-800 rounded-[2.5rem] overflow-hidden border border-slate-700/50 hover:border-pink-500/50 transition-all duration-700 cursor-pointer shadow-2xl hover:shadow-pink-500/10 flex flex-col"
            onClick={() => onSelect(character)}
          >
            <div className="absolute inset-0 z-0">
              <img 
                src={character.avatar} 
                alt={character.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent opacity-90" />
            </div>
            
            <div className="relative z-10 mt-auto p-7 space-y-3 translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
              <div className="flex flex-wrap gap-2">
                {character.tags.map(tag => (
                  <span key={tag} className="px-2.5 py-1 bg-pink-500/20 backdrop-blur-xl rounded-full text-[9px] uppercase font-black text-pink-300 border border-pink-500/30 tracking-wider">
                    {tag}
                  </span>
                ))}
              </div>
              <div>
                <h3 className="text-2xl font-black text-white leading-tight">{character.name}</h3>
                <p className="text-slate-300 text-xs font-semibold italic opacity-80 group-hover:opacity-100 transition-opacity">
                  {character.tagline}
                </p>
              </div>
              
              <div className="pt-2 opacity-0 group-hover:opacity-100 transition-all duration-500 delay-75">
                <div className="w-full py-3 bg-white text-slate-950 rounded-2xl text-center font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-transform">
                  Nhắn tin ngay
                </div>
              </div>
            </div>

            {/* Glowing active state indicator */}
            <div className="absolute top-5 left-5">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950/60 backdrop-blur-md rounded-full border border-white/10">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                <span className="text-[10px] font-black text-white uppercase tracking-tighter">Online</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CharacterGallery;
