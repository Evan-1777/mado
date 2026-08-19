export namespace settings {
	
	export class Settings {
	    Theme: string;
	    WordWrap: boolean;
	    Math: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Theme = source["Theme"];
	        this.WordWrap = source["WordWrap"];
	        this.Math = source["Math"];
	    }
	}

}

