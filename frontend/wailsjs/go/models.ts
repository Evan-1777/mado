export namespace settings {
	
	export class Settings {
	    Theme: string;
	    Wrap: boolean;
	    Math: boolean;
	    PreviewFont: string;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Theme = source["Theme"];
	        this.Wrap = source["Wrap"];
	        this.Math = source["Math"];
	        this.PreviewFont = source["PreviewFont"];
	    }
	}

}
