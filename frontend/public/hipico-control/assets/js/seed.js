const seedUid = (prefix) => `${prefix}-${crypto.randomUUID()}`;
export const DEFAULT_RACETRACKS = [
    "Alamitos TB", "Aqueduct", "Arlington", "Assiniboia", "Belmont Park", "Belterra Park",
    "Canterbury Park", "Century Mile", "Charles Town", "Churchill Downs", "Colonial Downs",
    "Del Mar", "Delaware Park", "Delta Downs", "Ellis Park", "Emerald Downs", "Evangeline Downs",
    "Fair Grounds", "Finger Lakes", "Fort Erie", "Gulfstream Park", "Hastings", "Hawthorne",
    "Horseshoe Indianapolis", "Keeneland", "La Rinconada", "Laurel Park", "Lone Star Park",
    "Los Alamitos", "Mahoning Valley", "Monmouth Park", "Mountaineer", "Oaklawn Park",
    "Parx Racing", "Penn National", "Pimlico", "Prairie Meadows", "Presque Isle Downs",
    "Remington Park", "Sam Houston", "Santa Anita", "Saratoga", "Tampa Bay Downs",
    "Thistledown", "Turf Paradise", "Valencia", "Will Rogers Downs", "Woodbine"
];
export function createBlankWorkspace() {
    const today = new Date().toISOString().slice(0, 10);
    return {
        schemaVersion: 8,
        version: 1,
        config: {
            clubName: "CLUB HIPICO TRIPLE CROWN",
            currency: "Bs.",
            commission: 0.05,
            exchangeRate: 160,
            quickPlays: ["1/2", "1P", "2/2", "2/3", "PP", "PK"],
            quickAmounts: [5000, 10000, 15000, 20000, 30000, 40000],
            recentRacetracks: ["Colonial Downs", "Parx Racing", "Will Rogers Downs", "Turf Paradise"],
            racetrackCatalog: [...DEFAULT_RACETRACKS],
            compactMode: true,
            footerMessage: "*PLANO REFERENCIAL*\n*_La guía es el chat_*\n(se gana y se cobra con el chat)\n*USTED ES SU PROPIO CORREDOR*\n*RECLAMOS AL PRIVADO*\n*NO DIGA:* ❌MALO❌; CASA FALTA...\n*TILDE SU JUGADA Y SE REVISARÁ*",
            theme: "system",
            activeGroupId: "group-1",
            activeWhatsappGroupId: "group-1",
            activeRaceByGroup: { "group-1": null },
            groups: [
                { id: "group-1", name: "Triple Crown", companyName: "CLUB HIPICO TRIPLE CROWN", color: "#7ea596", currency: "Bs.", exchangeRate: 160, commission: 0.05, showConversion: true, autoRate: true, clientLabel: "Participantes", footerMessage: "*PLANO REFERENCIAL*\n*_La guía es el chat_*\n(se gana y se cobra con el chat)\n*USTED ES SU PROPIO CORREDOR*\n*RECLAMOS AL PRIVADO*\n*NO DIGA:* ❌MALO❌; CASA FALTA...\n*TILDE SU JUGADA Y SE REVISARÁ*" }
            ]
        },
        participants: [],
        days: [{ id: seedUid("day"), groupId: "group-1", date: today, status: "open", closedAt: null, closure: null }],
        races: [],
        advancedBets: [],
        movements: [],
        exchangeRates: [{ id: seedUid("rate"), groupId: "group-1", date: today, rate: 160 }],
        weekClosures: [],
        pollas: [],
        audit: [],
        syncQueue: [],
        activeRaceId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}
