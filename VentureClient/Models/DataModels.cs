using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace VentureClient.Models
{
    public class StringOrArrayConverter : JsonConverter
    {
        public override bool CanConvert(Type objectType)
        {
            return objectType == typeof(List<string>);
        }

        public override object ReadJson(JsonReader reader, Type objectType, object existingValue, JsonSerializer serializer)
        {
            var token = JToken.Load(reader);
            if (token.Type == JTokenType.Array)
            {
                return token.ToObject<List<string>>();
            }
            return new List<string> { token.ToString() };
        }

        public override void WriteJson(JsonWriter writer, object value, JsonSerializer serializer)
        {
            serializer.Serialize(writer, value);
        }
    }

    public class ItemData
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("price")]
        public int Price { get; set; }

        [JsonProperty("type")]
        public string Type { get; set; }

        [JsonProperty("tier")]
        public int Tier { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("icon")]
        public string Icon { get; set; }

        [JsonProperty("rarity")]
        public string Rarity { get; set; }

        [JsonProperty("canBeInMerchantWares")]
        public bool? CanBeInMerchantWares { get; set; }

        [JsonProperty("slot")]
        [JsonConverter(typeof(StringOrArrayConverter))]
        public List<string> Slot { get; set; }

        [JsonProperty("bonusStats")]
        public Dictionary<string, int> BonusStats { get; set; }

        // gemSlot can be boolean or int in JSON, we can parse it as a JToken or string
        [JsonProperty("gemSlot")]
        public JToken GemSlot { get; set; }

        [JsonProperty("quantity")]
        public int? Quantity { get; set; }

        [JsonProperty("hands")]
        public int? Hands { get; set; }

        [JsonProperty("socketedGem")]
        public ItemData SocketedGem { get; set; }

        [JsonProperty("charges")]
        public int? Charges { get; set; }

        [JsonProperty("learnsRecipe")]
        public string LearnsRecipe { get; set; }

        [JsonProperty("permanentMerchantStock")]
        public bool? PermanentMerchantStock { get; set; }

        [JsonProperty("cost")]
        public int? Cost { get; set; }

        [JsonProperty("heal")]
        public int? Heal { get; set; }

        [JsonProperty("grantsSlot")]
        public string GrantsSlot { get; set; }

        [JsonProperty("gemBonus")]
        public Dictionary<string, int> GemBonus { get; set; }
    }

    public class SpellData
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("cost")]
        public int Cost { get; set; }

        [JsonProperty("cooldown")]
        public int Cooldown { get; set; }

        [JsonProperty("school")]
        public string School { get; set; }

        [JsonProperty("range")]
        public string Range { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("type")]
        public string Type { get; set; }

        [JsonProperty("stat")]
        [JsonConverter(typeof(StringOrArrayConverter))]
        public List<string> Stat { get; set; }

        [JsonProperty("damage")]
        public int? Damage { get; set; }

        [JsonProperty("hit")]
        public int? Hit { get; set; }

        [JsonProperty("damageType")]
        public string DamageType { get; set; }

        [JsonProperty("icon")]
        public string Icon { get; set; }

        [JsonProperty("rarity")]
        public string Rarity { get; set; }
    }

    public class RecipeResult
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("quantity")]
        public int? Quantity { get; set; }
    }

    public class RecipeData
    {
        [JsonProperty("result")]
        public RecipeResult Result { get; set; }

        [JsonProperty("materials")]
        public Dictionary<string, int> Materials { get; set; }

        [JsonProperty("category")]
        public string Category { get; set; }

        [JsonProperty("requiresDiscovery")]
        public bool? RequiresDiscovery { get; set; }
    }

    public class CardData
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("type")]
        public string Type { get; set; }

        [JsonProperty("isBoss")]
        public bool? IsBoss { get; set; }

        [JsonProperty("health")]
        public int? Health { get; set; }

        [JsonProperty("maxHealth")]
        public int? MaxHealth { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("icon")]
        public string Icon { get; set; }

        [JsonProperty("imageUrl")]
        public string ImageUrl { get; set; }
    }

    public class CardPoolEntry
    {
        [JsonProperty("card")]
        public CardData Card { get; set; }

        [JsonProperty("count")]
        public int Count { get; set; }
    }

    public class BuffDebuffState
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("stacks")]
        public int Stacks { get; set; }

        [JsonProperty("duration")]
        public int Duration { get; set; }
    }

    public class QuestDetails
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("title")]
        public string Title { get; set; }

        [JsonProperty("target")]
        public string Target { get; set; }

        [JsonProperty("required")]
        public int Required { get; set; }

        [JsonProperty("turnInItems")]
        public Dictionary<string, int> TurnInItems { get; set; }
    }

    public class QuestState
    {
        [JsonProperty("details")]
        public QuestDetails Details { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }

        [JsonProperty("progress")]
        public int Progress { get; set; }
    }

    public class EquipmentState
    {
        [JsonProperty("mainHand")]
        public ItemData MainHand { get; set; }

        [JsonProperty("offHand")]
        public ItemData OffHand { get; set; }

        [JsonProperty("helmet")]
        public ItemData Helmet { get; set; }

        [JsonProperty("armor")]
        public ItemData Armor { get; set; }

        [JsonProperty("boots")]
        public ItemData Boots { get; set; }

        [JsonProperty("accessory")]
        public ItemData Accessory { get; set; }

        [JsonProperty("ammo")]
        public ItemData Ammo { get; set; }
    }

    public class CharacterState
    {
        [JsonProperty("characterName")]
        public string CharacterName { get; set; }

        [JsonProperty("characterIcon")]
        public string CharacterIcon { get; set; }

        [JsonProperty("title")]
        public string Title { get; set; }

        private List<string> _unlockedTitles = new List<string>();
        [JsonProperty("unlockedTitles")]
        public List<string> UnlockedTitles
        {
            get => _unlockedTitles ??= new List<string>();
            set => _unlockedTitles = value;
        }

        [JsonProperty("health")]
        public int Health { get; set; }

        [JsonProperty("maxHealth")]
        public int MaxHealth { get; set; }

        [JsonProperty("shield")]
        public int Shield { get; set; }

        [JsonProperty("wisdom")]
        public int Wisdom { get; set; }

        [JsonProperty("strength")]
        public int Strength { get; set; }

        [JsonProperty("agility")]
        public int Agility { get; set; }

        [JsonProperty("defense")]
        public int Defense { get; set; }

        [JsonProperty("luck")]
        public int Luck { get; set; }

        [JsonProperty("physicalResistance")]
        public int PhysicalResistance { get; set; }

        [JsonProperty("magicalResistance")]
        public int MagicalResistance { get; set; }

        [JsonProperty("fireResistance")]
        public int FireResistance { get; set; }

        [JsonProperty("frostResistance")]
        public int FrostResistance { get; set; }

        [JsonProperty("natureResistance")]
        public int NatureResistance { get; set; }

        [JsonProperty("arcaneResistance")]
        public int ArcaneResistance { get; set; }

        [JsonProperty("holyResistance")]
        public int HolyResistance { get; set; }

        [JsonProperty("firePower")]
        public int FirePower { get; set; }

        [JsonProperty("frostPower")]
        public int FrostPower { get; set; }

        [JsonProperty("naturePower")]
        public int NaturePower { get; set; }

        [JsonProperty("arcanePower")]
        public int ArcanePower { get; set; }

        [JsonProperty("holyPower")]
        public int HolyPower { get; set; }

        [JsonProperty("physicalPower")]
        public int PhysicalPower { get; set; }

        [JsonProperty("mining")]
        public int Mining { get; set; }

        [JsonProperty("fishing")]
        public int Fishing { get; set; }

        [JsonProperty("woodcutting")]
        public int Woodcutting { get; set; }

        [JsonProperty("harvesting")]
        public int Harvesting { get; set; }

        [JsonProperty("gold")]
        public int Gold { get; set; }

        [JsonProperty("questPoints")]
        public int QuestPoints { get; set; }

        [JsonProperty("totalQuestPointsEarned")]
        public int TotalQuestPointsEarned { get; set; }

        [JsonProperty("spellsLearnedFromTraining")]
        public int SpellsLearnedFromTraining { get; set; }

        [JsonProperty("trainingRefreshCount")]
        public int TrainingRefreshCount { get; set; }

        private List<string> _trainingOfferings = new List<string>();
        [JsonProperty("trainingOfferings")]
        public List<string> TrainingOfferings
        {
            get => _trainingOfferings ??= new List<string>();
            set => _trainingOfferings = value;
        }

        [JsonProperty("actionPoints")]
        public int ActionPoints { get; set; }

        [JsonProperty("focus")]
        public int Focus { get; set; }

        private List<ItemData> _inventory = new List<ItemData>();
        [JsonProperty("inventory")]
        public List<ItemData> Inventory
        {
            get => _inventory ??= new List<ItemData>();
            set => _inventory = value;
        }

        private List<ItemData> _bank = new List<ItemData>();
        [JsonProperty("bank")]
        public List<ItemData> Bank
        {
            get => _bank ??= new List<ItemData>();
            set => _bank = value;
        }

        private List<BuffDebuffState> _buffs = new List<BuffDebuffState>();
        [JsonProperty("buffs")]
        public List<BuffDebuffState> Buffs
        {
            get => _buffs ??= new List<BuffDebuffState>();
            set => _buffs = value;
        }

        private List<BuffDebuffState> _debuffs = new List<BuffDebuffState>();
        [JsonProperty("debuffs")]
        public List<BuffDebuffState> Debuffs
        {
            get => _debuffs ??= new List<BuffDebuffState>();
            set => _debuffs = value;
        }

        private List<SpellData> _spellbook = new List<SpellData>();
        [JsonProperty("spellbook")]
        public List<SpellData> Spellbook
        {
            get => _spellbook ??= new List<SpellData>();
            set => _spellbook = value;
        }

        private List<SpellData> _equippedSpells = new List<SpellData>();
        [JsonProperty("equippedSpells")]
        public List<SpellData> EquippedSpells
        {
            get => _equippedSpells ??= new List<SpellData>();
            set => _equippedSpells = value;
        }

        private List<string> _knownRecipes = new List<string>();
        [JsonProperty("knownRecipes")]
        public List<string> KnownRecipes
        {
            get => _knownRecipes ??= new List<string>();
            set => _knownRecipes = value;
        }

        private EquipmentState _equipment = new EquipmentState();
        [JsonProperty("equipment")]
        public EquipmentState Equipment
        {
            get => _equipment ??= new EquipmentState();
            set => _equipment = value;
        }

        private List<QuestState> _quests = new List<QuestState>();
        [JsonProperty("quests")]
        public List<QuestState> Quests
        {
            get => _quests ??= new List<QuestState>();
            set => _quests = value;
        }

        private Dictionary<string, int> _spellCooldowns = new Dictionary<string, int>();
        [JsonProperty("spellCooldowns")]
        public Dictionary<string, int> SpellCooldowns
        {
            get => _spellCooldowns ??= new Dictionary<string, int>();
            set => _spellCooldowns = value;
        }

        private Dictionary<string, int> _weaponCooldowns = new Dictionary<string, int>();
        [JsonProperty("weaponCooldowns")]
        public Dictionary<string, int> WeaponCooldowns
        {
            get => _weaponCooldowns ??= new Dictionary<string, int>();
            set => _weaponCooldowns = value;
        }

        private Dictionary<string, int> _itemCooldowns = new Dictionary<string, int>();
        [JsonProperty("itemCooldowns")]
        public Dictionary<string, int> ItemCooldowns
        {
            get => _itemCooldowns ??= new Dictionary<string, int>();
            set => _itemCooldowns = value;
        }

        private List<ItemData> _merchantStock = new List<ItemData>();
        [JsonProperty("merchantStock")]
        public List<ItemData> MerchantStock
        {
            get => _merchantStock ??= new List<ItemData>();
            set => _merchantStock = value;
        }

        [JsonProperty("merchantLastStocked")]
        public string MerchantLastStocked { get; set; }

        private Dictionary<string, double> _cardDefeatTimes = new Dictionary<string, double>();
        [JsonProperty("cardDefeatTimes")]
        public Dictionary<string, double> CardDefeatTimes
        {
            get => _cardDefeatTimes ??= new Dictionary<string, double>();
            set => _cardDefeatTimes = value;
        }

        [JsonProperty("partyId")]
        public string PartyId { get; set; }

        [JsonProperty("duelId")]
        public string DuelId { get; set; }
    }

    public class PartyState
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("leader")]
        public string Leader { get; set; }

        [JsonProperty("members")]
        public List<string> Members { get; set; } = new List<string>();
    }

    public class AdventureState
    {
        [JsonProperty("zone")]
        public string Zone { get; set; }

        [JsonProperty("zoneCards")]
        public List<CardState> Cards { get; set; } = new List<CardState>();

        [JsonProperty("log")]
        public List<LogEntry> Logs { get; set; } = new List<LogEntry>();

        [JsonProperty("zoneDeck")]
        public List<CardState> ZoneDeck { get; set; } = new List<CardState>();
    }

    public class CardState
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("type")]
        public string Type { get; set; }

        [JsonProperty("health")]
        public int Health { get; set; }

        [JsonProperty("maxHealth")]
        public int MaxHealth { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("icon")]
        public string Icon { get; set; }

        [JsonProperty("imageUrl")]
        public string ImageUrl { get; set; }
    }

    public class LogEntry
    {
        [JsonProperty("message")]
        public string Message { get; set; }

        [JsonProperty("type")]
        public string Type { get; set; } // 'combat', 'chat', etc.
    }
}
