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

    public class QuestState
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }

        [JsonProperty("progress")]
        public int Progress { get; set; }

        [JsonProperty("maxProgress")]
        public int MaxProgress { get; set; }
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

        [JsonProperty("unlockedTitles")]
        public List<string> UnlockedTitles { get; set; } = new List<string>();

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

        [JsonProperty("trainingOfferings")]
        public List<SpellData> TrainingOfferings { get; set; } = new List<SpellData>();

        [JsonProperty("actionPoints")]
        public int ActionPoints { get; set; }

        [JsonProperty("focus")]
        public int Focus { get; set; }

        [JsonProperty("inventory")]
        public List<ItemData> Inventory { get; set; } = new List<ItemData>();

        [JsonProperty("bank")]
        public List<ItemData> Bank { get; set; } = new List<ItemData>();

        [JsonProperty("buffs")]
        public List<BuffDebuffState> Buffs { get; set; } = new List<BuffDebuffState>();

        [JsonProperty("debuffs")]
        public List<BuffDebuffState> Debuffs { get; set; } = new List<BuffDebuffState>();

        [JsonProperty("spellbook")]
        public List<SpellData> Spellbook { get; set; } = new List<SpellData>();

        [JsonProperty("knownRecipes")]
        public List<string> KnownRecipes { get; set; } = new List<string>();

        [JsonProperty("equipment")]
        public EquipmentState Equipment { get; set; } = new EquipmentState();

        [JsonProperty("quests")]
        public List<QuestState> Quests { get; set; } = new List<QuestState>();

        [JsonProperty("spellCooldowns")]
        public Dictionary<string, int> SpellCooldowns { get; set; } = new Dictionary<string, int>();

        [JsonProperty("weaponCooldowns")]
        public Dictionary<string, int> WeaponCooldowns { get; set; } = new Dictionary<string, int>();

        [JsonProperty("itemCooldowns")]
        public Dictionary<string, int> ItemCooldowns { get; set; } = new Dictionary<string, int>();

        [JsonProperty("merchantStock")]
        public List<ItemData> MerchantStock { get; set; } = new List<ItemData>();

        [JsonProperty("merchantLastStocked")]
        public string MerchantLastStocked { get; set; }

        [JsonProperty("cardDefeatTimes")]
        public Dictionary<string, double> CardDefeatTimes { get; set; } = new Dictionary<string, double>();

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

        [JsonProperty("cards")]
        public List<CardState> Cards { get; set; } = new List<CardState>();

        [JsonProperty("logs")]
        public List<LogEntry> Logs { get; set; } = new List<LogEntry>();
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
    }

    public class LogEntry
    {
        [JsonProperty("message")]
        public string Message { get; set; }

        [JsonProperty("type")]
        public string Type { get; set; } // 'combat', 'chat', etc.
    }
}
